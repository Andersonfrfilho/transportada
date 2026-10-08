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

## E12 — T2.4: reemissão com o código nacional e a chave do provedor (07/10/2026)

- `correction` aceita `nationalTaxationCode` (`^\d{6}$`) e `simplesNationalRate` (mesma regex do perfil,
  `NFSE_SIMPLES_NATIONAL_RATE_PATTERN` em `nfse.schema.ts`) no schema da rota e na política; os campos entram no
  `payload` novo e na digital do pedido (corrigir e repetir a chave é pedido novo). Com `v3`, reemitir um
  payload que ainda não tem os dois (e a correção não os traz) dá `409 NFSE_NATIONAL_TAXATION_CODE_MISSING`
  antes de qualquer escrita.
- Regra da chave em função pura: `src/nfse-invoices/domain/nfse-provider-request-key.policy.ts`
  (`resolveInheritedProviderRequestKey`). Copia a chave só se a tentativa anterior está `failed`, **sem**
  `providerDocumentId` na nota e com `last_error_cause` ∈ {`timeout`, `transport_failure`} e chave gravada;
  qualquer outro caso (primeira tentativa, rejeitada, ambígua sem chave, outra causa, outro status) devolve
  `undefined` e a chave da tentativa nova é o próprio `attemptId`.
- Repositório: `createAttempt` gera o `id` da tentativa no código (`randomUUID`) para gravar
  `provider_request_key = id` já no INSERT (tentativas de emissão; cancelamento fica sem chave) ou a chave
  herdada; `request_fingerprint` único por tentativa **inalterado** (continua o `sha256(fingerprint:número)`).
  `findLatestIssueAttempt` (porta, repositório, `buildLatestIssueAttemptFilters` com contrato de isolamento por
  empresa em `invoice-query-tenant-safety.contract.ts`) lê causa/chave da última emissão e o
  `providerDocumentId` da nota.
- Mutação: ampliar o conjunto de causas (`unexpected_status`) derruba "causa que não é de transporte";
  remover a guarda do `providerDocumentId` derruba "o provedor já devolveu o id". Restaurados.
- `bun test` de nfse-schema, nfse-domain, nfse-invoices-application, nfse-profiles, nfse-invoices-http,
  nfse-callbacks, env-example, composition e test-registry -> **396 pass / 0 fail**.
- `bun run typecheck` -> 0 erros. `bunx eslint` e `bunx prettier --check` limpos. `db:generate` -> `no_changes`.

## E13 — T2.5: contrato e integração da API contra Postgres (07/10/2026)

Banco: **Postgres 18.4 nativo descartável** (`initdb` no scratchpad, `127.0.0.1:55433`, `fsync=off`), apontado por
`DRIZZLE_TEST_DATABASE_URL`, que os testes de integração leem antes de `DATABASE_URL`. O `.env.test` aponta
para a infra de E2E (Docker, 65432), que não foi subida: **a integração rodou de fato, nada foi pulado por
falta de banco** (as contagens abaixo são de testes executados). `make migration-test` e `make check` da
raiz não foram rodados (Docker); o equivalente de migration está na E10.

De `apps/api-transportada`:

- `bun --env-file=../../.env.test test --timeout 120000` (contrato, descoberta padrão) -> **10828 pass / 25 skip / 0 fail**
  (202 arquivos; os 25 skip já existiam: contrato que depende de infra ausente).
- `bun --env-file=../../.env.test run test` (lista explícita do `package.json`) -> 10828 pass / 25 skip / 0 fail.
- Integração, nos mesmos cortes que a CI usa (`scripts/integration-shard.ts`), cada um em primeiro plano:
  `... test --timeout 120000 $(bun scripts/integration-shard.ts 1/4)` -> 401 pass / 0 fail (317 s);
  `2/4` -> 288 pass / 0 fail (239 s); `3/4` -> 268 pass / 0 fail (252 s); `4/4` -> 283 pass / 1 skip / 0 fail
  (294 s; o skip não foi identificado por execução — o único candidato do corte com guarda de infraestrutura é
  `toll-booth-reload.integration.ts`, que exige storage); `identity` (os 7 arquivos que falam com o
  Keycloak, entre eles `whatsapp-issuance-confirm`, que cria NFS-e pelo repositório real, `server` e `auth-me`)
  -> 39 pass / 0 fail. Total de integração: **1279 pass / 1 skip / 0 fail**.
- Arquivo novo `test/integration/nfse-provider-request-key.integration.ts` (4 testes contra Postgres: chave =
  `attemptId` na primeira tentativa, cópia após falha ambígua, chave própria após rejeição, nota com
  `providerDocumentId` não é ambígua, isolamento por empresa), na lista `test:integration` do `package.json`.
- Gates finais: `bun run typecheck` 0 erros; `bun run lint` (src + test inteiros) 0 problemas;
  `bunx prettier --check` nos arquivos tocados limpo; `db:generate` `no_changes`.

## E14 — Ajuste da herança da chave do provedor (revisão da Fase 2, 07/10/2026)

O executor herdava a chave só em `timeout` e `transport_failure`. Ampliado para `unexpected_status`
(5xx) e `malformed_response`, que também podem ter criado a nota na Nota RP; herdar a chave é
inofensivo quando ela não foi criada (pedido recusado na validação libera a chave). `not_found`,
`invalid_payload`, `provider_not_configured` e `credential_unreadable` nunca chegam a criar a nota e
continuam com chave nova. Contrato: `test/nfse-domain/provider-request-key.contract.ts` (66 pass).

## E15 — T3.1: contratos vermelhos do cliente Nota RP v3 e do limitador (07/10/2026)

Arquivos novos (só teste, nenhum código de produção): `apps/worker-transportada/test/nota-rp-v3-client.contract.test.ts`
(entrypoint fino, registrado na lista explícita do script `test` do `package.json` do worker, logo após o da v2) e
`test/nota-rp-v3/{fixture,issue,status,cancel,documents,rate-limit}.contract.ts`. Corpos de resposta vêm do
`swagger.yaml` (exemplos de `emitir` 200, `ErrorResponse`, `UnprocessableEntity` com `errors[]`, `NotaListItem`,
`pdf`/`xml` com `base64_file`); o `409` com `id_nota` vem da descrição de `flags.hash_pedido`.

Superfície contratada (a T3.2 implementa com estes nomes):

- `createNotaRpV3Client({ clock, config, fetch })` em `src/nfse-issuance/infrastructure/nota-rp-v3.client.ts`;
  `config = { baseUrl, callbackBaseUrl, callbackToken, municipalRegistration, taxId, timeoutMilliseconds, token }`;
  `issue({ payload, providerRequestKey, providerDocumentId? })` recebe o **payload congelado** e monta o corpo;
  `fetchStatus`, `cancel`, `fetchDocument` com as mesmas entradas e os mesmos tipos de outcome da v2.
- `createRateLimitedFetch(fetch, { minIntervalMilliseconds, clock: () => number, sleep })` em
  `src/nfse-issuance/infrastructure/nota-rp-rate-limit.ts` (assinatura fixada pela orquestração; tem dois
  parâmetros posicionais, o que a regra §10 do code-standart proíbe — a T3.2 pode trocar por objeto único
  e ajustar o `createLimited` do teste).
- Código nomeado novo, escolhido aqui: `NFSE_ISS_EXIGIBILITY_UNSUPPORTED` (exigibilidade diferente de `'1'`).
  Os outros dois são os da ADR: `NFSE_NATIONAL_TAXATION_CODE_MISSING`, `NFSE_SIMPLES_RATE_MISSING`.

Casos (77 testes; os `for` geram um teste nomeado por status):

- Emissão — cabeçalhos/URL: POST `{origem}/api/v3/nota/emitir`; token, CNPJ e IM só dígitos (entrada formatada),
  `content-type`/`accept` JSON; sinal de timeout; `baseUrl` com `/api/v2`, só origem e com barra final dão a
  mesma URL.
- Emissão — corpo: igualdade exata com `EXPECTED_ISSUE_BODY` (tabela do plan); `data_competencia` em
  America/Sao_Paulo (relógio 02:30Z de 08/10 → `07/10/2026`; outro relógio → `05/01/2026`); `issRate`
  `0.027500` → `2.75`; `serviceAmount`/`simplesNationalRate` como número sem recálculo; `issqn_retido`;
  complemento/telefone só se não vazios; flags (`hash_pedido` = chave recebida, `webhook_url` com o callback
  token, `enviar_email:false`, sem `regime`); `id_nota` numérico só com `providerDocumentId`.
- Emissão — recusa local sem HTTP: sem `nationalTaxationCode`, sem `simplesNationalRate`, `issExigibility '3'`.
- Emissão — respostas: 200 ok → accepted `'12345'`; 200 `success:false` → rejected; 200 sem `id_nota` →
  malformed; 409 com `id_nota` → accepted; 400/401/403/404/422 → `NOTA_RP_HTTP_<s>` com a mensagem; 422 do
  swagger com `errors[]`; saneamento (token e callback token fora, ≤ 500 caracteres) em 4xx e em 200
  `success:false`; 408/425/429/500/502/503 → error `unexpected_status`; rede → `transport_failure`;
  `TimeoutError` → `timeout`; corpo não-JSON → malformed.
- Consulta: GET `{origem}/api/v3/nota/listar?id_nota=` com cabeçalhos e sem corpo; Criada/Enviando/Pendente →
  pending; Sucesso → authorized (`verificationCode` = `chave_acesso`, `authorizedAt` = `data_emissao`); Sucesso
  sem `numero`/`data_emissao`/`chave_acesso` → malformed (três testes); Falha → `NOTA_RP_FALHA` com mensagem
  fixa (dois corpos diferentes, mesma recusa); Cancelada → cancelled; status desconhecido (`Processando`) →
  malformed; `results: []` e 404 → error `not_found` (nunca rejected); 401/403 na consulta → error, não
  recusa; 5xx → `unexpected_status`; não-JSON e envelope sem `success` → malformed; rede sem vazar segredo.
- Cancelamento: POST `{origem}/api/v3/nota/cancelar` com cabeçalhos; `'2'` → `servico_nao_prestado`, `'4'` →
  `outros` + `descricao: "Nota duplicada"`, `id_nota` numérico, `enviar_email:false`; 200 → accepted; 200
  `success:false` → rejected saneado; **409 → rejected `NOTA_RP_HTTP_409`**; 5xx; rede.
- Documentos (pdf e xml): GET `{origem}/api/v3/nota/{kind}?id_nota=` com cabeçalhos; `base64_file` → ok com os
  bytes decodificados e o `contentType` do tipo; base64 que não é PDF → malformed (a assinatura segue em
  `resolveNfseDocumentBytes`); `success:false` → rejected; 404 → `not_found`; 5xx.
- Limitador: concorrentes espaçados ≥ 1000 ms na ordem de chegada; dois consumidores da mesma instância no
  mesmo relógio; intervalo vencido não espera; espera só o que falta (600 ms após 400); erro propaga e não
  trava a fila; repassa `url`/`init` e devolve a mesma `Response`; relógio falso não espera de verdade.

Decisões abertas (para a T3.2/T3.4 decidirem, não inventadas aqui):

- TODO decisão: **409 do `/cancelar`** ("nota já cancelada" pelo swagger) poderia valer `accepted` (efeito já
  alcançado). O contrato fixa `rejected NOTA_RP_HTTP_409` por ora; mudar exige contrato novo.
- 409 do `/emitir` **sem** `id_nota` (ex.: nota que não está em `Falha` e não pode ser reeditada) — sem caso.
- 4xx do `/cancelar` além do 409 (400/403/404/422) — sem caso; a v2 os tratava como `unexpected_status`.
- Código da recusa de `success:false` em 200 (a v2 usa `NOTA_RP_UNKNOWN`) — o contrato só exige `rejected` e a
  mensagem.
- `taker.address` ausente no payload (permitido pelo schema da v2) — sem caso.

Comandos (de `apps/worker-transportada`):

- `bun test --timeout 120000 ./test/nota-rp-v3-client.contract.test.ts` -> **0 pass / 77 fail**, todos por
  `Cannot find module` de `nota-rp-v3.client.js` ou `nota-rp-rate-limit.js` (vermelho por construção).
- `bun run typecheck` -> 2 erros, **ambos TS2307 por construção**: `test/nota-rp-v3/fixture.ts` (módulo do
  cliente) e `test/nota-rp-v3/rate-limit.contract.ts` (módulo do limitador). Nenhum outro erro.
- `bun run lint` (src + test inteiros) -> 0 problemas. `bunx prettier --check` nos arquivos novos e no
  `package.json` -> limpo.
- Sonda das fixtures de documento contra `resolveNfseDocumentBytes` (script no scratchpad): PDF 8 bytes, XML 45
  bytes, HTML em base64 → `undefined` — os casos de documento são satisfazíveis.
- **Prova por mutação: não viável sem implementação** (todo teste já falha no import). Fica para a T3.2, com as
  mutações-alvo: (1) usar `baseUrl` cru em vez da origem — derruba "baseUrl com /api/v2, só com a origem…";
  (2) `not_found` → `rejected` — derruba os dois de "nota ausente adia"; (3) não sanear o token — derruba os
  de saneamento e de rede sem vazar segredo.

## E16 — T3.2: cliente Nota RP v3 e limitador de taxa (07/10/2026)

Arquivos novos (`apps/worker-transportada/src/nfse-issuance/infrastructure/`): `nota-rp-v3.client.ts`
(`createNotaRpV3Client({clock, config, fetch})`), `nota-rp-v3.types.ts`, `nota-rp-v3-transport.ts` (origem +
`/api/v3`, cabeçalhos `X-Auth-*`, pontuação removida sem tocar nas letras), `nota-rp-v3-envelope.ts`
(saneamento, 500 caracteres), `nota-rp-v3-issue-body.mapper.ts` (zod + tabela do plan),
`nota-rp-v3-status.mapper.ts`, `nota-rp-v3-document.reader.ts`, `nota-rp-rate-limit.ts` (+ `.types.ts`,
objeto único `{fetch, minIntervalMilliseconds, clock, sleep}`). `toIssRatePercentage` saiu do
`nfse-fiscal-gateway.ts` para `nfse-iss-rate-percentage.ts` (mesmo código, importado pelos dois).

Ajustes do architect, todos com teste vermelho antes: `authorizedAt` vem de `data_competencia` (reserva
`data_emissao`) como `AAAA-MM-DDT00:00:00-03:00`; cliente nunca lança (payload fora do formato →
`NFSE_PAYLOAD_INVALID` sem HTTP; sem `taker.address` o tomador vai com `documento` e `nome`); `id_nota`
diferente do pedido → `not_found`; 409 sem `id_nota` → `NOTA_RP_HTTP_409`; CNPJ alfanumérico preserva letras;
`hash_pedido` acompanha o `id_nota` na reedição. Extras: `webhook_url` omitido sem `https://`, `base64_file`
vazio → malformed, descrição > 2000 → `NFSE_DESCRIPTION_TOO_LONG_FOR_PROVIDER`. Testes: 77 → 87.

Gates (de `apps/worker-transportada`): `bun run typecheck` 0 erros; `nota-rp-v3-client` 87 pass / 0 fail;
`nota-rp-v2-client` 48 pass; `nfse-fiscal-gateway` 13 pass; `bun run lint` limpo; `prettier --check` limpo.

Prova por mutação (aplicada à mão, revertida):

- (a) `baseUrl` cru em vez da origem: 6 falhas — emite em POST…/emitir; baseUrl com /api/v2, só origem ou barra
  final; consulta GET listar; cancela em POST…/cancelar; pdf GET; xml GET.
- (b) `not_found` como `rejected`: 3 falhas — "results vazio é error not_found"; "results[0] com id_nota
  diferente do pedido…"; "documentos > 404 é error not_found" (o 404 do listar não foi mutado).
- (c) token sem saneamento: 3 falhas — "mensagem de recusa sai sem token nem callback token e com até 500
  caracteres"; "success:false em 200 também é saneado"; "cancelamento > 200 com success:false… saneada".

Decisões desta task: `success:false` na **consulta** vira `error unexpected_status` (não `rejected`, como na
v2): recusa do listar não prova nada sobre a nota (ADR 0098 §7). 4xx do cancelar além do 409 →
`unexpected_status`. O 409 do cancelar segue `rejected NOTA_RP_HTTP_409` até a T3.4 (consulta de confirmação).

## E17 — T3.3: gateways roteiam pela versão da tentativa e limitador único (07/10/2026)

O que mudou (`apps/worker-transportada`):

- Política `nfse-issuance/domain/nfse-provider-api-version.policy.ts`: `parseProviderApiVersion` (ausente ou
  desconhecida = `v2`), `resolveLatestIssuanceApiVersion` (maior `attempt_number` de emissão) e
  `canReuseProviderDocumentId` (id_nota só se **toda** emissão anterior foi v3). Leitor
  `drizzle-nfse-issuance-history.reader.ts`, reaproveitado pelos dois repositórios.
- Coluna `provider_request_key` entra no schema do worker; `NfseCredentialAccess` (emissão e consulta) ganha
  `taxId`; os dois repositórios o carregam. Execução entrega `providerApiVersion`, `providerRequestKey?` e
  `reissueProviderDocumentId?`; o consumidor usa o `attemptId` como chave de tentativa legada.
- Porta `NfseFiscalGateway`/`NfseStatusPort`: `issue` com `providerApiVersion`, `providerRequestKey`,
  `providerDocumentId?`; `cancel`/`fetchStatus`/`fetchDocument` com `providerApiVersion`. Roteamento v3 em
  `nfse-v3-client.resolver.ts` (compartilhado pelos dois gateways); v2 inalterado.
- `main.ts`: um `createRateLimitedFetch` (1 s) criado uma vez e passado como `v3Fetch` aos dois gateways; a v2
  segue no `fetch` cru. Uma réplica do worker assumida (documentado).
- `.railway/railway.ts`: `NFSE_PROVIDER_API_VERSION: 'v2'` no serviço `api` (literal, sem segredo).
  **`railway config apply` NÃO foi executado.** Validação: o módulo carrega e, avaliado com `ctx` de produção e de
  staging, contém a variável literal (o motor `plan` exige a CLI >= 5.42.1, ausente aqui). ADR 0098, spec e plan
  corrigidos: a variável é lida só pela API.

Testes (novos em `test/nfse-provider-routing/`, entrypoint `nfse-provider-routing.contract.test.ts`, registrado
no `package.json`): política (15), gateway de emissão (v2 inalterado; v3 com chave, id_nota e config completa;
sem callback → `provider_not_configured`; envelope ilegível; payload v3 sem `nationalTaxationCode` → `rejected`
e não `invalid_payload`; v3 usa `v3Fetch` e v2 o fetch cru; cancel/doc/status por versão), gateway de consulta e
dois gateways compartilhando o relógio do limitador (2ª chamada espera 1000 ms; v2 não espera). Execução:
`nfse-issuance-execution-input` reescrito (8) e três casos novos no consumidor.

Gates (de `apps/worker-transportada`): `bun run typecheck` 0 erros · `bun run lint` limpo · `bunx prettier --check`
limpo (src, test, package.json, `.railway/railway.ts`) · `bun run test` **2142 pass / 0 fail**.

SQL real (Postgres nativo descartável, porta 56421, todas as migrations da API aplicadas — uma de backfill de
dados falhou por tabela auxiliar e não afeta NFS-e; FKs das 6 tabelas NFS-e desativados só no banco descartável,
script apagado, banco derrubado): `load` da emissão devolveu `v3`, `key-2`, `reissue '777'`, CNPJ; `load` do
cancelamento devolveu `v3` (da última emissão) e o documento; `listCandidates` devolveu `v3` e o CNPJ; trocando a
emissão 1 para `v2`, o `reissue` sumiu. Não há teste de integração do worker para NFS-e (nenhum arquivo em
`test/integration` toca estes repositórios): **o que se provou foi a consulta, não um teste versionado**.

Desvios honestos: a política e os testes do consumidor foram escritos junto da implementação (vermelho comprovado
só para o roteamento dos gateways e para a execução).

## E18 — T3.4: cancelamento confirmado pela consulta e gateways ponta a ponta (07/10/2026)

Decisão E15 (409 do `/cancelar`) fechada: o cliente v3 consulta `GET /nota/listar?id_nota=` após o 409
(`queryStatus`, o mesmo caminho do `fetchStatus`, atrás do limitador): `Cancelada` → `accepted`; outro status
(`Sucesso`, `Pendente`, `Falha`) → `rejected NOTA_RP_HTTP_409`; consulta que falha (5xx, rede, nota ausente,
corpo sem lista) → `error` com a causa da consulta. **Nunca `accepted` sem confirmar.** Os códigos `'2'` e `'4'`
do banco já estavam no cliente (T3.2) e agora têm teste pelo gateway.

Contratos: `test/nota-rp-v3/cancel.contract.ts` (o caso único de 409 virou 8: confirmado, três status não
cancelados, 5xx, nota ausente, rede e corpo fora do formato) e `test/nfse-provider-routing/end-to-end.contract.ts`
(8): os dois gateways com o **cliente v3 real** e `fetch` gravador — emitir (`hash_pedido`), consultar (nos dois
gateways), documento PDF, cancelar `'4'`, 409 confirmado/não confirmado/consulta fora do ar, e a v2 só no fetch cru.
Vermelho antes do código: 5 falhas (as outras três já passavam porque `rejected` era o comportamento antigo).

Prova por mutação (aplicada à mão, revertida): trocar `confirmation.status === 'cancelled'` por aceitar sempre
→ **7 falhas** (três `rejected`, 5xx, ausente, rede, corpo inválido); arquivo restaurado, 94 pass.

Gates (de `apps/worker-transportada`): `bun run typecheck` 0 erros · `nota-rp-v3-client` 94 pass · `nfse-provider-routing`
35 pass · lint e prettier limpos (resultado completo na E19).

## E19 — T3.5: lista explícita de testes do worker (07/10/2026)

`apps/worker-transportada/package.json` (`test`) lista `./test/nota-rp-v3-client.contract.test.ts` (T3.1, que
importa `cancel/issue/status/documents/rate-limit`) e `./test/nfse-provider-routing.contract.test.ts` (T3.3, que
importa política, gateway de emissão, gateway de consulta/limitador e ponta a ponta). Os arquivos `*.contract.ts`
das subpastas só rodam por esses entrypoints; nenhum arquivo de teste novo ficou fora da lista.

Gates finais (de `apps/worker-transportada`, após T3.4): `bun run typecheck` 0 erros · `bun run lint` limpo ·
`bunx prettier --check` limpo nos arquivos tocados · `bun run test` **2157 pass / 0 fail / 100 arquivos**
(era 2142 antes da T3.4: +15 do cancelamento e do ponta a ponta).

`test:integration`: **não rodou, e não precisava** — nenhum arquivo de `test/integration` toca os repositórios
de NFS-e alterados. A consulta SQL nova foi provada à parte, em Postgres nativo descartável (E17), sem teste
versionado: ver a lacuna em E17. Não declarar a integração do worker como verde por isso.

## E20 — T4.1: campo no perfil de emissão (07/10/2026)

Aba Configurações do perfil ganha "Código de tributação nacional" (6 dígitos) e a alíquota do Simples Nacional
(`simplesNationalRate`, string, vírgula ou ponto, mesmo padrão do schema da API), em pt-BR e en, com ajuda do par
`cTribNac` + `cTribMun`. Componente `NfseNationalTaxationFields`, regras em `nfseNationalTaxation.service.ts`; a
resposta do perfil rejeita valor fora do formato. Commit `2883000e7`. Contratos: `national-taxation-fields.contract.tsx`,
`nfse-settings.contract.ts`, locais pt-BR/en em `navigation-and-locales.contract.ts`.

Gates (de `apps/frontend-transportada`): `bun run typecheck` 0 erros · `bun run lint` 0 erros (16 warnings antigos) ·
`bun run test` 7602 pass / 0 fail e entrypoint `nfse-invoice` 1104 pass / 0 fail · prettier limpo nos arquivos tocados.
O typecheck foi conferido com só os arquivos do commit (stash do restante): limpo.
Ressalva: o entrypoint `nfse-invoice.contract.test.ts` (já na lista do `package.json`) só importa os dois testes novos no
commit da T4.2; no commit da T4.1 sozinho o teste do componente não é executado.

## E21 — T4.2: correção na reemissão (07/10/2026)

O diálogo de reemissão (individual e em lote) mostra o par nacional lido do payload congelado; o corpo enviado
(`buildNfseReissueCorrectionBody`) leva só o que mudou, com a alíquota no formato da API; o 409
`NFSE_NATIONAL_TAXATION_CODE_MISSING` tem mensagem própria. O detalhe aceita o payload congelado com e sem os dois campos
(notas anteriores à v3). Contrato da API conferido em `nfse-invoices.schema.ts` (`nationalTaxationCode` 6 dígitos,
`simplesNationalRate` string). Commit `faaa00add`; contrato `national-taxation.contract.ts` (registrado via
`nfse-invoice.contract.test.ts`, já na lista do `package.json`). Gates: os mesmos da E20.
Pendente: T4.3 (revisão de design com print).

## E22 — T4.3: revisão de design e usabilidade (07/10/2026)

Sem print: a infra (Docker/MinIO do GHCR) não sobe nesta máquina, então a revisão foi feita no código dos componentes, no CSS
contra os vizinhos (`.fieldGrid`/`.emissionField`) e nos contratos de render do harness (web.md §15 itens 1-2; o item 3, o
print, **segue pendente** para quando houver ambiente). Conferido: rótulo ligado por `htmlFor`, dica e erro em
`aria-describedby`, `aria-invalid` com a borda `--color-alert` igual ao vizinho, `inputMode` numérico/decimal, campos
nativos (teclado e foco do vizinho), paridade pt-BR/en das chaves novas, coluna única abaixo de 40 rem, botão de confirmar
desabilitado com a mensagem do campo visível. Defeito achado e corrigido (commit `8cf1c713a`): o aviso do lote
(`bulkReissue.missingNationalTaxation`, `role="alert"`) usava `.placeholder` (cinza apagado) e passava despercebido; agora
usa `.emissionError` (`--color-alert`). Gates (de `apps/frontend-transportada`): typecheck 0 erros · lint 0 erros ·
`bun run test` 0 fail (`nfse-invoice` 1104 pass) · prettier limpo.
