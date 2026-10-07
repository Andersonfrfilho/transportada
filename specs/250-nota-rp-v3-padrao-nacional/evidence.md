# Evidência — Feature 250

## E1 — Rejeição que originou a spec (07/10/2026)

Nota de serviço da Comercial Zaragoza (R$ 2.601,95, 32 NF-e), reemitida pelo painel:
`Última falha: NOTA_RP_HTTP_403 — Esta empresa não é válida para esta versão da API. Utilize a
versão v3.` Três tentativas, estado `Rejeitada`.

Causa anterior, já corrigida (PR #142): a segunda reemissão da mesma nota estourava
`nfse_issuance_attempts_company_invoice_kind_fingerprint_unique` (23505 → 500). O log do resultado da
prefeitura entrou no PR #143.

## E2 — Atendimento da Nota RP (07/10/2026)

Suporte (Valéria): "Sim, ribeirão está utilizando o padrão nacional e o webservice antigo ainda está
ativo"; "pode usar essa V3". Documentação indicada: <https://www.notarp.com.br/docs#overview>. A
documentação v3 ainda diz "exceto Ribeirão Preto" (desatualizada).

## E3 — Nota 74 emitida à mão no portal (06/10/2026 10:43, `ambGer 1`)

Valores transcritos do XML (o arquivo fica fora do repositório: leva certificado):

| Campo                                | Valor                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `cTribNac`                           | `160201` ("Outros serviços de transporte de natureza municipal")              |
| `cTribMun`                           | `160101` ("16.01.01 Transporte de Natureza Municipal")                        |
| `cNBS`                               | `105011900`                                                                   |
| `regTrib`                            | `opSimpNac 3` · `regApTribSN 1` · `regEspTrib 0`                              |
| `tribISSQN` / `tpRetISSQN` / `pAliq` | `1` / `1` (ISS não retido) / `2.00`                                           |
| `totTrib.pTotTribSN`                 | `2.00`                                                                        |
| `dCompet`                            | dia da emissão (`2026-10-06`)                                                 |
| `IBSCBS`                             | `finNFSe 0` · `cIndOp 070101` · `indDest 0` · `CST 000` · `cClassTrib 000001` |
| Tomador                              | CNPJ, endereço completo (Taubaté `3554102`), `fone`                           |
| Valor / ISS                          | `vServ 2601.95` · `vISSQN 52.04`                                              |

Descrição enviada à mão: "Prestação de serviço de transporte rodoviário de cargas em Ribeirão
Preto." (sem a lista das 32 NF-e que o sistema gera).

## E4 — Contrato v3 (swagger.yaml, 100 KB, lido em 07/10/2026)

Rotas: `empresa/*`, `nota/{listar,emitir,cancelar,pdf,xml,remover}`, `dominio/*`. Autenticação:
`X-Auth-User-Token` + `X-Auth-CNPJ` + `X-Auth-IM`. Limite 1 req/s (burst 3). `hash_pedido`:
idempotência por 24 h (`409` com o `id_nota` original). Changelog: 10/08/2026 (webhook assinado,
41 reentregas), 30/07/2026 (`valor_deducoes`), 12/04/2026 (`pis_retido`/`cofins_retido`).

## E5 — Esclarecimentos fechados (T0.3, 07/10/2026)

Respostas do usuário: alíquota de `tributos_aproximados` **2,00%** (igual à nota 74); ISS **não
retido**; `cTribMun` **o do XML (160101)**. Risco aceito: a v3 documenta mínimo de 4,50%. Mitigação:
valor em coluna do perfil e medição na primeira emissão real (T6.2).

## E6 — T0.1: pontos que falam com a Nota RP (07/10/2026, a partir de `origin/staging`)

`git grep -il "notarp|nota-rp|NotaRp"` em `apps/`: **não existe cópia do cliente no
`cron-transportada`** (a menção da spec 040 é histórica). Pontos de código a trocar:
`apps/worker-transportada/src/nfse-issuance/infrastructure/{nota-rp-v2.client.ts,nfse-fiscal-gateway.ts}`
e `apps/worker-transportada/src/nfse-status-pull/infrastructure/nfse-fiscal-status.gateway.ts`.
Na API só o nome do provedor (`notarp`) em `nfse.schema.ts` e `nfse-provider-credentials.use-case.ts`.
Testes do v2: `test/nota-rp-v2-client.contract.test.ts`, `test/nota-rp-v2/{fixture,no-bearer.contract}.ts`,
`test/nfse-fiscal-gateway.contract.test.ts` (worker).

## E7 — T0.4

Recorte do contrato v3 gravado em `docs/ai-context/worker-transportada.md`
("A Nota RP v3 — recorte do contrato usado").

## E8 — T1.1: revisão `architect`/Opus do ADR 0098 (07/10/2026)

Veredito **aprovado com ajustes**; bloqueavam a implementação: porta e consumidor mudam (chave do
provedor, `taxId`), `Falha` sem texto no `listar`, limitador por processo, idempotência entre
reemissões e `not_found` nunca `rejected`. Todos incorporados no ADR 0098, `plan.md` e `tasks.md`
(T2.1–T2.4, T3.2–T3.4, T5.1, T6.1). Conferido no código antes de aceitar: `issue({credential,
payload})` sem chave (`nfse-fiscal-gateway.ts:140`), `NfseCredentialAccess` sem `taxId`, recusa sem
`rejection` → `MALFORMED` (`nfse-reconciliation-outcome.policy.ts:84`), motivo `'2'|'4'`
(`nfse-issuance-execution.schema.ts:23`).
