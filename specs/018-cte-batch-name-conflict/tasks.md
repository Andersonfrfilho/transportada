# Tasks

Feature 018 — Conflito de nome de lote com resposta honesta.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); teste de isolamento de tenant sempre que a
task mexer em query; task só fecha com evidência em `evidence.md` (comando, saída, o que prova).
Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real, nome de lote de tenant real
ou XML fiscal em teste, fixture, log ou evidência.

`[P]` = pode rodar em paralelo com a anterior sem tocar nos mesmos arquivos.

## Fase A — `409` no lugar do `500` (api)

> 🤖 Modelo: `sonnet`

- [x] T001 Teste de contrato **falhando** do repositório: com um `database` falso cujo `insert`
      rejeita com um erro portando `constraint: 'cte_batches_company_id_name_unique'` e
      `errno: '23505'`, `createBatch` lança `ApiError` com `code: 'CTE_BATCH_NAME_TAKEN'` e
      `status: 409`; com `constraint: 'cte_batches_company_id_idempotency_key_unique'` ou com
      `errno` diferente de `23505`, o erro original sobe **intacto** (mesma instância) —
      `apps/api-transportada/test/cte-batch-infrastructure/name-conflict.contract.ts` (novo) +
      `import` em `apps/api-transportada/test/cte-batch-infrastructure.contract.test.ts` — evidência:
      saída do `bun test` com o arquivo novo listado e falhando pelo motivo certo.

- [x] T002 Implementar: `createBatchNameTakenError()` em
      `apps/api-transportada/src/cte-batches/domain/cte-batch.error.ts`
      (`CTE_BATCH_NAME_TAKEN`, 409, no formato das demais `create*Error`) e o guard em
      `apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch.repository.ts` —
      constante `NAME_CONSTRAINT` + `runGuarded` no molde de
      `drizzle-fleet-vehicle.repository.ts:130`, usando `violatedUniqueConstraint` já existente.
      Comparação pelo **nome da constraint**, nunca pelo `sqlState` sozinho. Nada muda em
      `create-cte-batch.service.ts` — evidência: T001 verde + `bun run typecheck`.

- [x] T003 Teste de integração em Postgres real, no molde de
      `test/integration/billing-repository.integration.ts` (`withDisposableDatabase` +
      `runDatabaseMigrations`): criar um lote, tentar outro com o **mesmo nome** na mesma empresa e
      afirmar `409` com `CTE_BATCH_NAME_TAKEN`; depois do erro, `cte_batches`, `cte_batch_items`,
      `cte_batch_item_documents`, `cte_batch_item_charges` e `cte_batch_events` continuam com a
      contagem de antes da tentativa (a criação é all-or-nothing). Cobrir o isolamento: o **mesmo
      nome** em outra empresa é criação válida — **mexe em escrita multi-tenant: isolamento
      obrigatório** — `apps/api-transportada/test/integration/cte-batch-name-conflict.integration.ts`
      (novo), registrado na lista **explícita** de `test:integration` no `package.json` da app —
      evidência: saída do `bun test` com `DRIZZLE_TEST_DATABASE_URL` apontando para o Postgres local.

## Fase B — Código de erro chegando ao cliente (frontend)

> 🤖 Modelo: `sonnet`

- [x] T004 Teste de contrato **falhando** do client: `createBatch` com resposta `409` e corpo
      `{ error: { code: 'CTE_BATCH_NAME_TAKEN', ... } }` rejeita com esse código; resposta não-ok sem
      corpo legível ou sem `error.code` continua rejeitando com `CTE_BATCH_REQUEST_FAILED`; o caminho
      de sucesso e `CTE_BATCH_RESPONSE_INVALID` seguem inalterados —
      `apps/frontend-transportada/test/cte-batch/client-and-queries.contract.ts` (existente) —
      evidência: saída falhando.

- [x] T005 Implementar em
      `apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchClient.service.ts`:
      `requestJson` lê o corpo antes de decidir e extrai `error.code` por type guard manual (sem zod),
      no formato de `cteProfilesClient.service.ts:41-66` — evidência: T004 verde.

## Fase C — Mensagem honesta no modal (frontend)

> 🤖 Modelo: `sonnet`

- [x] T006 Teste de contrato **falhando** do modal: com a projeção calculada e a criação em erro por
      `CTE_BATCH_NAME_TAKEN`, o modal mostra o texto de **nome já em uso**, mantém a tabela de
      projeção renderizada e o campo de nome editável, e o botão de confirmar volta a ficar
      disponível; com a criação em erro por outro código, mostra o texto de **falha ao criar**; com a
      projeção em erro, mostra o texto de **falha ao calcular a projeção**; nenhuma string fora de
      locale e as chaves batem entre `nfeWorkspace.locale.json` e `nfeWorkspace.en.locale.json` —
      `apps/frontend-transportada/test/nfe-workspace/cte-emission-dialog.contract.ts` (existente) —
      evidência: saída falhando.

- [x] T007 Implementar: `CteEmissionStatus` passa a distinguir `previewError` e `createError`
      (`apps/frontend-transportada/src/modules/nfe-workspace/shared/cteEmission.service.ts`), o hook
      deixa de colapsar os dois em `'error'` e mantém `errorCode`
      (`.../hooks/useCteEmissionDialog.hook.ts`), o componente escolhe entre `cteEmission.errorPreview`,
      `cteEmission.errorNameTaken` e `cteEmission.errorCreate`
      (`.../components/CteEmissionDialog.component.tsx`), e as duas locales ganham as chaves novas no
      lugar de `cteEmission.error` (`.../locales/nfeWorkspace.locale.json`, `.../nfeWorkspace.en.locale.json`).
      Confirmar que `canConfirmEmission` não trava o botão depois de uma criação em erro —
      evidência: T006 verde + varredura provando que `cteEmission.error` não é mais referenciada.

## Fase D — 500 auditável (api)

> 🤖 Modelo: `sonnet`

- [x] T008 Teste de contrato **falhando** no arquivo de HTTP existente: uma rota que rejeita com um
      erro de Postgres sintético (`constraint`, `errno: '23505'`, `message` contendo um valor
      reconhecível) responde `500` genérico e loga `errorName`, `sqlState` e `constraint` — e o log
      **não** contém a `message` nem o valor reconhecível, no mesmo formato das asserções de
      vazamento que o arquivo já tem — `apps/api-transportada/test/http.contract.test.ts` (existente)
      — evidência: saída falhando.

- [x] T009 Implementar `describeErrorForLog` em
      `apps/api-transportada/src/logging/error-descriptor.service.ts` (novo), sobre o
      `findPostgresError` de `src/database/postgres-error.support.ts`, devolvendo **só**
      `{ errorName, sqlState?, constraint? }` — nunca `message`, `stack` ou parâmetro de query — e
      ligá-lo em `apps/api-transportada/src/http/response.service.ts:30` — evidência: T008 verde +
      `bun run typecheck`.

## Fase E — Fechamento

> 🤖 Modelo: `sonnet`

- [x] T010 Gate completo e verificação ao vivo: `make check` e, na stack local, reproduzir a criação
      com nome repetido provando (a) `POST /cte-batches` respondendo `409` com `CTE_BATCH_NAME_TAKEN`,
      (b) o modal exibindo a mensagem de nome em uso com a projeção ainda na tela, (c) a criação
      passando ao corrigir o nome, e (d) a linha `http_request_failed` de um 500 qualquer trazendo
      `errorName`/`sqlState`/`constraint` sem mensagem — evidência em
      `specs/018-cte-batch-name-conflict/evidence.md`, sem dado fiscal real.
