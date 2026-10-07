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

## E9 — T2.1: contratos vermelhos da Fase 2 (07/10/2026)

Contratos novos (todos registrados nos entrypoints já listados no `package.json`, nenhum arquivo de
entrada novo): `test/nfse-domain/provider-request-key.contract.ts` (chave do provedor: primeira,
rejeitada, ambígua por timeout e por transporte, ambígua sem chave, com `providerDocumentId`, outra
causa, outro status), `test/nfse-invoices-application/invoice-national-taxation.contract.ts`
(`409 NFSE_NATIONAL_TAXATION_CODE_MISSING` na v3, congelamento, `providerApiVersion`, v2 sem mudança de
hash, correção na reemissão, herança da chave), `test/nfse-callbacks/provider-api-version.contract.ts`
(env), mais casos em `test/nfse-profiles/emission-profiles.contract.ts`,
`test/nfse-invoices-http/invoice-reissue-correction.contract.ts` e `test/nfse-schema/nfse.contract.ts`.

Vermelho medido (de `apps/api-transportada`):
`bun test ./test/nfse-schema.contract.test.ts ./test/nfse-domain.contract.test.ts ./test/nfse-invoices-application.contract.test.ts ./test/nfse-profiles.contract.test.ts ./test/nfse-invoices-http.contract.test.ts`
-> 167 pass / 17 fail (domínio e aplicação nem carregam: `Cannot find module ...nfse-provider-request-key.policy`
e `Export named 'NfseNationalTaxationCodeMissingError' not found`);
`bun test ./test/nfse-callbacks.contract.test.ts` -> 41 pass / 7 fail.

`bun run typecheck` fica **vermelho por construção** nesta task (22 erros TS: símbolos que a T2.2/T2.3/T2.4
criam). Fecha verde na T2.3, quando os símbolos existem.

## E10 — T2.2: migration `20261007205304_nfse_national_taxation` (07/10/2026)

Aditiva: `nfse_emission_profiles.national_taxation_code` (text, check `^[0-9]{6}$`),
`nfse_emission_profiles.simples_national_rate` (numeric(9,6), check `>= 0`; percentual: `2.000000` =
2,00%), `nfse_issuance_attempts.provider_request_key` (text). Todas nuláveis, sem DEFAULT. Pasta com
`migration.sql`, `rollback.sql` (recusa com valor gravado, remove a linha do journal) e `snapshot.json`.
Numeração conferida contra `origin/staging` (última: `20261007140303_business_calendar`; `rev-list HEAD..origin/staging` = 0).

- `bun run db:generate --name probe` (apps/api-transportada) -> `{"status":"no_changes"}`.
- **`make migration-test` NÃO foi usado**: ele chama `postgres-up` (Docker Compose do projeto, o Postgres
  local tem histórico de I/O error e compartilha o projeto com a árvore principal). Rodado o comando que o
  target executa (`bun run --cwd apps/api-transportada db:test`) com `DRIZZLE_TEST_DATABASE_URL` apontando
  para um **Postgres 18.4 nativo descartável** (`initdb` no scratchpad, porta 55433, `fsync=off`):
  `bun run db:test` -> **156 pass / 0 fail** (2614 expects; eram 2592 antes da asserção nova, então a
  integração rodou, não pulou).
- Asserção nova `test/database-migration/nfse-national-taxation.assertion.ts` (ligada em
  `database-migration.integration.ts`): linha antiga atravessa com NULL; recusa `16020`, `1602011`,
  `16020a`, `''` e taxa negativa pelas CHECK; rollback recusa com perfil preenchido e, depois, com chave de
  tentativa; sem dados remove as três colunas e a migration volta a aplicar.
- `test/nfse-schema.contract.test.ts` -> 58 pass / 0 fail. `static-migration.contract.ts` ganhou o nome
  da pasta na lista.
- `bunx eslint` nos arquivos tocados e `bunx prettier --check` limpos.
- `bun run typecheck` segue com os mesmos 22 erros da T2.1 (só em `test/`, símbolos da T2.3/T2.4); nenhum
  erro em `src/`.

## E11 — T2.3: perfil, payload congelado, env e erro nomeado (07/10/2026)

- Perfil: `nationalTaxationCode` (`^\d{6}$`) e `simplesNationalRate` (percentual 0–100, até 6 casas; `2.000000`
  = 2,00%) em mapper, Zod (criação e PATCH; ausente vira `null`, `null` explícito limpa), repositórios, rotas e
  respostas; `NfseInvoiceProfile` os lê. Semente local com `null`.
- `NFSE_PROVIDER_API_VERSION` (`v2`|`v3`, em branco/ausente = `v2`, valor desconhecido derruba o boot) no
  `environment.schema.ts`, em `ApiEnvironment.nfseProviderApiVersion`, em `.env.example` (`=v2`) e injetada em
  `createNfseInvoiceUseCase` (rota e WhatsApp) e `createNfseInvoiceReissueUseCase` pelo `main.ts`.
- `freezeNfseIssuancePayload` leva os dois campos (strings, sem aritmética) só quando a versão é `v3`; com `v2`
  o payload e o hash ficam byte a byte como antes (contrato cobre). `buildNfseProviderConfig` grava
  `providerApiVersion`. Quando a dependência não é passada (testes antigos) nada é gravado: ausente = v2.
- Erro `NfseNationalTaxationCodeMissingError` (409 `NFSE_NATIONAL_TAXATION_CODE_MISSING`), lançado na criação
  logo depois de o perfil ser validado como ativo (nada é gravado). `FrozenPayloadShape`, `NfseLastIssuancePayload`
  e o `lastPayload` da resposta carregam os campos quando existem (pré-preenchimento da Fase 4).
- `bunx eslint` e `bunx prettier --check` nos arquivos tocados limpos.
- `bun test` de nfse-schema, nfse-invoices-application, nfse-profiles, nfse-invoices-http, nfse-callbacks,
  env-example, composition e test-registry -> 331 pass / 3 fail; os 3 são contratos da T2.4 (correção do
  código nacional na reemissão + 409 da reemissão e herança da chave).
- `bun run typecheck`: 11 erros, **todos em `test/` e todos de símbolos da T2.4**
  (`nfse-provider-request-key.policy`, `findLatestIssueAttempt`, `providerRequestKey`, `correction.nationalTaxationCode`);
  `src/` sem erro.
