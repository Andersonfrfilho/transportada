# Plan — Feature 250

## Contexto (a conferir na T0.1 contra origin/staging)

- Peça trocável: `apps/worker-transportada/src/nfse-issuance/infrastructure/nota-rp-v2.client.ts`
  (593 linhas) atrás de `nfse-fiscal-gateway.ts` (`createClient` já é ponto de injeção). O status pull
  tem gateway próprio (`nfse-status-pull/.../nfse-fiscal-status.gateway.ts`) que também fala com o
  provedor — **dois** pontos a trocar, não um.
- A spec 040 menciona uma cópia do cliente em `cron-transportada`; `git ls-tree` em staging não achou
  arquivo `nota-rp*` no cron. T0.1 confirma; se existir, muda junto (CLAUDE.md).
- Consumidor (`nfse-issuance-consumer.effect.ts`) e write-back **não mudam**: `accepted` com
  `providerDocumentId` → `pending_authorization` → pull.
- Specs relacionadas: 032, 039, 040, 042 (T017 aberta), 043 (T010 aberta), 044, 175; ADR-0029,
  0035, 0071. Nenhuma duplica a decisão desta.

## Desenho

### Seleção do cliente (ADR 0098)

`NFSE_PROVIDER_API_VERSION` (`v2` | `v3`, padrão `v2`) é lida pela **API e pelo worker** e vale só para
emissões novas; a API grava `providerApiVersion` em `providerConfig` e todo o resto (consulta,
cancelamento, documentos) roteia pela versão **da tentativa**. O cliente v3 usa só a **origem** de
`NFSE_PROVIDER_BASE_URL` e acrescenta `/api/v3`.

### Mapeamento payload congelado → corpo v3 (só renomear/formatar)

| Campo v3                                                 | Origem                                                                              | Nota                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `tomador.documento`                                      | `taker.taxId`                                                                       | só dígitos                                                                       |
| `tomador.nome`                                           | `taker.legalName`                                                                   |                                                                                  |
| `tomador.cep/estado/cidade/bairro/endereco/numero`       | `taker.address.*`                                                                   | cidade por nome + UF (opção 1 da doc); `complemento`/`telefone` só se não vazios |
| `servico.descricao`                                      | `description`                                                                       |                                                                                  |
| `servico.valor_total`                                    | `serviceAmount`                                                                     | número; string→número textual (sem aritmética)                                   |
| `servico.codigo_tributacao_nacional`                     | `nationalTaxationCode`                                                              | **novo**; ausente → erro de bloqueio                                             |
| `servico.codigo_tributacao_municipal`                    | `municipalTaxationCode`                                                             | `160101` após a virada                                                           |
| `servico.codigo_nbs`                                     | `nbsCode`                                                                           | 9 dígitos                                                                        |
| `servico.data_competencia`                               | dia da tentativa, `dd/mm/aaaa`, America/Sao_Paulo                                   | mesma regra do `DataEmissao` da v2                                               |
| `servico.pais` / `servico.municipio`                     | `"BR"` / `municipalityIbgeCode`                                                     |                                                                                  |
| `servico.incidencia_issqn`                               | `issExigibility`                                                                    | `'1'` → `operacao_tributavel`; demais → erro nomeado até haver caso real         |
| `servico.aliquota_issqn`                                 | `issRate`                                                                           | fração→percentual por string (reusa `toIssRatePercentage`)                       |
| `servico.issqn_retido`                                   | `issWithheld`                                                                       |                                                                                  |
| `servico.tributos_aproximados.aliquota_simples_nacional` | `simplesNationalRate` (perfil, novo)                                                | 2,00% decidido; ausente na v3 → erro nomeado                                     |
| `flags.hash_pedido`                                      | `provider_request_key` (= `attemptId`; copiada se a tentativa anterior foi ambígua) | idempotência 24 h; risco residual depois disso                                   |
| `id_nota` (corpo)                                        | `providerDocumentId` da nota em `Falha`, se houver                                  | reedita a nota em vez de deixá-la órfã                                           |
| `flags.webhook_url`                                      | `{callbackBaseUrl}/public/nfse-callbacks/{callbackToken}`                           | exige `https://`                                                                 |
| `flags.enviar_email`                                     | `false`                                                                             |                                                                                  |
| `flags.regime`                                           | omitido                                                                             | usa o cadastro da empresa                                                        |

### Respostas

- `200 {success:true,id_nota}` → `accepted` com `providerDocumentId = String(id_nota)`.
- `409` com `id_nota` → `accepted` (replay do `hash_pedido`).
- `429`/`408`/`425`/`5xx`/rede → recuperável (`error`), mesmo backoff da v2.
- `400/401/403/404/422` em `/emitir` → `rejected` com `NOTA_RP_HTTP_<status>` + mensagem saneada
  (limite de 500 caracteres, já existente). `success:false` em 200 → `rejected`.
- Status (`not_found` → `error`/adiar, **nunca** `rejected`): `Criada|Enviando|Pendente` → `pending`; `Sucesso` → `authorized` (exige `numero`,
  `data_emissao` e `chave_acesso`; a chave substitui o "código de verificação" da v2);
  `Falha` → `rejected` (erros do webhook/consulta); `Cancelada` → `cancelled`.
- Motivo de cancelamento: o banco guarda `'2'`/`'4'`; v3: `'2'`→`servico_nao_prestado`, `'4'` (nota
  duplicada, sem par direto)→`outros` com `descricao` "Nota duplicada", `'1'` não existe no banco.
- Motivo de cancelamento: o banco guarda `'2'`/`'4'`; v3: `'2'`→`servico_nao_prestado`, `'4'` (nota
  duplicada, sem par direto)→`outros` com `descricao` "Nota duplicada".
- Cancelamento: `motivo` por **nome** (`erro_emissao | servico_nao_prestado | outros`; `descricao`
  obrigatória em `outros`), `enviar_email:false`. Só nota com chave de acesso é cancelável.
- PDF/XML: `GET /api/v3/nota/pdf|xml?id_nota=` → `{success, base64_file}` (mesma validação de
  assinatura de bytes de `resolveNfseDocumentBytes`).

### Limite de taxa

Limitador **único por processo** (ADR 0098 §8): envolve o `fetch` injetado no composition root e é
compartilhado pelos dois gateways, espaçamento ≥ 1 s. Assume uma réplica do worker; `429` é
recuperável; o status pull custa ~3N s por ciclo (`listar`, `pdf`, `xml`).

## Riscos e mitigação

| Risco                                                | Mitigação                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Par fiscal errado → prefeitura recusa (`E215`)       | `cTribNac`+`cTribMun` do perfil conferidos contra a nota 74; primeira emissão real de valor mínimo, sob aprovação                          |
| Duplicar a nota 74 ao reemitir                       | Fase 5: vincular a nota manual em vez de reemitir; nenhum job reemite sozinho                                                              |
| Alíquota de tributos aproximados rejeitada (< 4,50%) | Valor decidido 2,00% em coluna do perfil; a T6.2 (nota real de valor mínimo) mede, e a correção é de dado                                  |
| Virada com notas v2 em voo                           | Não há "drenar" (a v2 já recusa a empresa): consulta adia em `not_found`; vínculo (Fase 5) ou portal; cancelar nota v2 é manual. T0.2 mede |
| Timeout que criou a nota e perdeu a resposta         | `provider_request_key` copiada na reemissão ambígua (T2.4); depois de 24 h o operador confere o portal                                     |
| Documentação v3 desatualizada (diz "exceto RP")      | Confirmado pelo suporte (07/10); registrar o e-mail/atendimento em `evidence.md`                                                           |
| Rate limit estourado em lote                         | Limitador por processo no `fetch` compartilhado; contrato com relógio injetado; uma réplica do worker                                      |
| Duas cópias do cliente divergirem                    | T0.1 + teste que importa a mesma tabela de mapeamento (se o cron tiver cópia)                                                              |

## Contrato HTTP (API própria)

Sem rota nova. Mudam apenas: `PATCH /nfse-emission-profiles/:id` e o corpo de criação aceitam
`nationalTaxationCode` (`^\d{6}$`); `POST /nfse-service-invoices/:id/reissue` aceita o campo em
`correction`. Resposta de bloqueio: `409` com código estável `NFSE_NATIONAL_TAXATION_CODE_MISSING`.
