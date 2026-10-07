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

### Seleção do cliente

`NFSE_PROVIDER_API_VERSION` (`v2` | `v3`, schema de env do worker e do cron, padrão `v2`) escolhe qual
fábrica o gateway usa. `NFSE_PROVIDER_BASE_URL` continua a URL única (ADR-0035): a v3 é
`https://www.notarp.com.br` + `/api/v3/...`; a v2 mantém o prefixo atual.

### Mapeamento payload congelado → corpo v3 (só renomear/formatar)

| Campo v3                                                 | Origem                                                    | Nota                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `tomador.documento`                                      | `taker.taxId`                                             | só dígitos                                                                       |
| `tomador.nome`                                           | `taker.legalName`                                         |                                                                                  |
| `tomador.cep/estado/cidade/bairro/endereco/numero`       | `taker.address.*`                                         | cidade por nome + UF (opção 1 da doc); `complemento`/`telefone` só se não vazios |
| `servico.descricao`                                      | `description`                                             |                                                                                  |
| `servico.valor_total`                                    | `serviceAmount`                                           | número; string→número textual (sem aritmética)                                   |
| `servico.codigo_tributacao_nacional`                     | `nationalTaxationCode`                                    | **novo**; ausente → erro de bloqueio                                             |
| `servico.codigo_tributacao_municipal`                    | `municipalTaxationCode`                                   | `160101` após a virada                                                           |
| `servico.codigo_nbs`                                     | `nbsCode`                                                 | 9 dígitos                                                                        |
| `servico.data_competencia`                               | dia da tentativa, `dd/mm/aaaa`, America/Sao_Paulo         | mesma regra do `DataEmissao` da v2                                               |
| `servico.pais` / `servico.municipio`                     | `"BR"` / `municipalityIbgeCode`                           |                                                                                  |
| `servico.incidencia_issqn`                               | `issExigibility`                                          | `'1'` → `operacao_tributavel`; demais → erro nomeado até haver caso real         |
| `servico.aliquota_issqn`                                 | `issRate`                                                 | fração→percentual por string (reusa `toIssRatePercentage`)                       |
| `servico.issqn_retido`                                   | `issWithheld`                                             |                                                                                  |
| `servico.tributos_aproximados.aliquota_simples_nacional` | perfil                                                    | **[NEEDS CLARIFICATION] 1**                                                      |
| `flags.hash_pedido`                                      | `attemptId`                                               | idempotência 24 h                                                                |
| `flags.webhook_url`                                      | `{callbackBaseUrl}/public/nfse-callbacks/{callbackToken}` | exige `https://`                                                                 |
| `flags.enviar_email`                                     | `false`                                                   |                                                                                  |
| `flags.regime`                                           | omitido                                                   | usa o cadastro da empresa                                                        |

### Respostas

- `200 {success:true,id_nota}` → `accepted` com `providerDocumentId = String(id_nota)`.
- `409` com `id_nota` → `accepted` (replay do `hash_pedido`).
- `429`/`408`/`425`/`5xx`/rede → recuperável (`error`), mesmo backoff da v2.
- `400/401/403/404/422` em `/emitir` → `rejected` com `NOTA_RP_HTTP_<status>` + mensagem saneada
  (limite de 500 caracteres, já existente). `success:false` em 200 → `rejected`.
- Status: `Criada|Enviando|Pendente` → `pending`; `Sucesso` → `authorized` (exige `numero`,
  `data_emissao` e `chave_acesso`; a chave substitui o "código de verificação" da v2);
  `Falha` → `rejected` (erros do webhook/consulta); `Cancelada` → `cancelled`.
- Cancelamento: `motivo` por **nome** (`erro_emissao | servico_nao_prestado | outros`; `descricao`
  obrigatória em `outros`), `enviar_email:false`. Só nota com chave de acesso é cancelável.
- PDF/XML: `GET /api/v3/nota/pdf|xml?id_nota=` → `{success, base64_file}` (mesma validação de
  assinatura de bytes de `resolveNfseDocumentBytes`).

### Limite de taxa

Fila de saída da Nota RP com espaçamento mínimo de ~1 s entre chamadas, por processo. O worker roda
com prefetch baixo; o status pull é sequencial. Não é fila nova: é um `throttle` no cliente v3.

## Riscos e mitigação

| Risco                                                | Mitigação                                                                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Par fiscal errado → prefeitura recusa (`E215`)       | `cTribNac`+`cTribMun` do perfil conferidos contra a nota 74; primeira emissão real de valor mínimo, sob aprovação                                   |
| Duplicar a nota 74 ao reemitir                       | Fase 5: vincular a nota manual em vez de reemitir; nenhum job reemite sozinho                                                                       |
| Alíquota de tributos aproximados rejeitada (< 4,50%) | [NEEDS CLARIFICATION] 1 fecha antes de codar a Fase 3                                                                                               |
| Virada com notas em voo                              | Notas `pending_authorization` da v2 continuam consultáveis? **Não** — `id_nota` da v2 não existe na v3. T0.2 mede quantas há; a virada espera zerar |
| Documentação v3 desatualizada (diz "exceto RP")      | Confirmado pelo suporte (07/10); registrar o e-mail/atendimento em `evidence.md`                                                                    |
| Rate limit estourado em lote                         | Throttle de 1 req/s; teste de contrato com relógio injetado                                                                                         |
| Duas cópias do cliente divergirem                    | T0.1 + teste que importa a mesma tabela de mapeamento (se o cron tiver cópia)                                                                       |

## Contrato HTTP (API própria)

Sem rota nova. Mudam apenas: `PATCH /nfse-emission-profiles/:id` e o corpo de criação aceitam
`nationalTaxationCode` (`^\d{6}$`); `POST /nfse-service-invoices/:id/reissue` aceita o campo em
`correction`. Resposta de bloqueio: `409` com código estável `NFSE_NATIONAL_TAXATION_CODE_MISSING`.
