# Plano técnico — Feature 018

## Contexto e premissas

- A constraint existe e é intencional: `cte_batches_company_id_name_unique UNIQUE (company_id, name)`.
  **Nenhuma migration nesta feature.**
- O repo já tem o helper de tradução: `src/database/postgres-error.support.ts` expõe
  `violatedUniqueConstraint(error)`, que percorre `cause` até 3 níveis e devolve o nome da constraint
  quando `sqlState === '23505'`. Já é usado por `fleet` (veículo e motorista), `mdfe-manifests` e
  `cte-profiles`. Esta feature **usa** o helper, não escreve outro.
- O padrão de aplicação também já existe: `drizzle-fleet-vehicle.repository.ts:130` embrulha a escrita
  em `runGuarded` e traduz a constraint em erro de domínio dentro do **repositório**. É o molde.
- O erro gêmeo já está modelado: `CteEmissionProfileNameTakenError` (`CTE_PROFILE_NAME_TAKEN`, 409).
  O lote ganha o equivalente em `cte-batches/domain/cte-batch.error.ts`, que já é o arquivo de todos
  os erros do módulo e já exporta funções `create*Error` retornando `ApiError`.
- O client HTTP correto já existe no frontend: `cteProfilesClient.service.ts:41-66` lê
  `payload.error.code` antes de lançar. `cteBatchClient.service.ts:111` descarta o corpo. A correção é
  alinhar o segundo ao primeiro, sem inventar formato.
- `useCteEmissionDialog` **já** expõe `errorCode` (`hook:152`); o componente simplesmente não o
  consome. Não é preciso mudar a assinatura do hook para distinguir as mensagens — só distinguir a
  origem (projeção × criação), o que exige separar o `status` colapsado de hoje.
- Frontend não usa zod: validação é type guard manual, e o client de perfis já tem `isRecord`/
  `isString` no formato a copiar.
- A criação inteira roda em transação (`unitOfWork.execute`), então o `409` não deixa lote parcial —
  mas isso precisa ser **provado**, não presumido, porque o insert do lote acontece antes dos itens.

## Onde cada defeito é corrigido

### 1. `409` em vez de `500` (api)

- `src/cte-batches/domain/cte-batch.error.ts` — `createBatchNameTakenError()`:
  `{ code: 'CTE_BATCH_NAME_TAKEN', message: 'Another CT-e batch already uses this name', status: 409 }`.
- `src/cte-batches/infrastructure/drizzle-cte-batch.repository.ts` — `createBatch` passa a rodar
  dentro de um `runGuarded` local, no formato de `drizzle-fleet-vehicle.repository.ts`:
  constante `NAME_CONSTRAINT = 'cte_batches_company_id_name_unique'`, e
  `if (violatedUniqueConstraint(error) === NAME_CONSTRAINT) throw createBatchNameTakenError()`.
  Qualquer outra violação **continua subindo** — o guard é por constraint, nunca por `sqlState`.
- Nada muda em `create-cte-batch.service.ts`: a aplicação não conhece nome de índice.

### 2. Código de erro chegando ao cliente (frontend)

- `src/modules/cte-batch/shared/cteBatchClient.service.ts` — `requestJson` passa a ler o corpo antes
  de decidir: com `!response.ok`, extrai `error.code` do envelope e lança esse código; sem código
  legível, mantém `CTE_BATCH_REQUEST_FAILED`. É a mesma função que `cteProfilesClient` já tem, com o
  mesmo `isRecord`/`isString`. O caminho de sucesso e todos os outros códigos existentes
  (`CTE_BATCH_RESPONSE_INVALID`) ficam intactos.

### 3. Mensagem honesta no modal (frontend)

- `src/modules/nfe-workspace/hooks/useCteEmissionDialog.hook.ts` — o `status` colapsado
  (`previewQuery.isError || createMutation.isError → 'error'`) é o que confunde projeção com criação.
  Entra `CTE_EMISSION_STATUS.previewError` e `CTE_EMISSION_STATUS.createError` no lugar do `'error'`
  único (`CteEmissionStatus` vive em `shared/cteEmission.service.ts`), com `errorCode` continuando a
  vir de `previewQuery.error ?? createMutation.error`. Precedência: se a criação falhou, a mensagem é
  da criação — a projeção que ficou na tela é válida.
- `src/modules/nfe-workspace/components/CteEmissionDialog.component.tsx` — escolhe entre
  `cteEmission.errorPreview`, `cteEmission.errorNameTaken` (quando `errorCode === 'CTE_BATCH_NAME_TAKEN'`)
  e `cteEmission.errorCreate`. Nenhum texto solto.
- `src/modules/nfe-workspace/locales/nfeWorkspace.locale.json` e `.en.locale.json` — `cteEmission.error`
  vira `cteEmission.errorPreview` (mesmo texto), e entram `errorCreate` e `errorNameTaken`. A chave
  antiga sai — nenhum outro consumidor a referencia.
- `canConfirmEmission` continua permitindo reenvio: com a projeção pronta e o nome corrigido, o botão
  volta a ficar ativo sem reabrir a seleção. Verificar que `createMutation.isError` não trava
  `canConfirm`.

### 4. 500 auditável sem instrumentação (api)

- `src/logging/error-descriptor.service.ts` (novo) — `describeErrorForLog(error)` devolve
  `{ errorName, sqlState?, constraint? }`, usando `findPostgresError` de
  `src/database/postgres-error.support.ts`. **Nunca** devolve `message`, `stack` ou parâmetro de
  query: a mensagem de `DrizzleQueryError` carrega os valores da query (nome de lote, ids e, em outras
  rotas, dado fiscal), e logá-la violaria a regra de não registrar dado sensível.
- `src/http/response.service.ts` — `createErrorResponse` passa `{ correlationId, ...describeErrorForLog(error) }`
  ao `safeLogError`. `http/` importa de `logging/`, que é onde já importa `safeLogError`; quem conhece
  Postgres é `logging/`, não `http/`.

## Testes

| Arquivo                                                                                                                                                       | Prova                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api-transportada/test/cte-batch-infrastructure/name-conflict.contract.ts` (novo, `import` em `cte-batch-infrastructure.contract.test.ts`)               | `createBatch` traduz **só** `cte_batches_company_id_name_unique` em `CTE_BATCH_NAME_TAKEN`/409; outra constraint e outro `sqlState` continuam subindo intactos                     |
| `apps/api-transportada/test/integration/cte-batch-name-conflict.integration.ts` (novo, registrado na lista explícita de `test:integration` do `package.json`) | em Postgres real: segundo lote com o mesmo nome → `409`, e **nenhum** lote, item, documento, cobrança ou evento sobra da tentativa; o mesmo nome em outra empresa é criação válida |
| `apps/api-transportada/test/http.contract.test.ts` (existente)                                                                                                | `http_request_failed` loga `errorName`, `sqlState` e `constraint`, e **não** contém a mensagem da exceção nem parâmetro de query                                                   |
| `apps/frontend-transportada/test/cte-batch/client-and-queries.contract.ts` (existente)                                                                        | `createBatch` lança o `error.code` do envelope em resposta não-ok; sem código legível, cai em `CTE_BATCH_REQUEST_FAILED`                                                           |
| `apps/frontend-transportada/test/nfe-workspace/cte-emission-dialog.contract.ts` (existente)                                                                   | as três mensagens distintas; a tabela de projeção continua renderizada com a criação em erro; o botão de confirmar volta a ficar disponível; nenhum texto fora de locale           |

O único registro novo no `package.json` é o teste de integração; os demais entram por `import` em
entrypoints já listados.

## Riscos e mitigação

| Risco                                                                                     | Mitigação                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guard capturando violação que não é de nome (idempotência, FK) e mascarando outro defeito | O guard compara o **nome da constraint**, não o `sqlState`; contrato cobre "outra constraint continua subindo"                                                                       |
| `409` deixando lote órfão gravado antes da falha                                          | Teste de integração conta linhas em `cte_batches`, `cte_batch_items`, `cte_batch_item_documents`, `cte_batch_item_charges` e `cte_batch_events` depois do erro                       |
| Log novo vazando dado sensível                                                            | `describeErrorForLog` é allowlist de três campos; o contrato de `http.contract.test.ts` afirma a ausência da mensagem, no mesmo formato dos testes de vazamento que o arquivo já tem |
| Renomear `cteEmission.error` quebrando outro consumidor                                   | A chave é referenciada só em `CteEmissionDialog.component.tsx:144`; a varredura entra no gate                                                                                        |
| Divergência entre as duas locales (pt-BR e en)                                            | O contrato de tradução do módulo já compara as chaves das duas                                                                                                                       |

## Gate de saída

`bun run --cwd apps/api-transportada test` · `bun run --cwd apps/frontend-transportada test` ·
`make check` · verificação ao vivo na stack local reproduzindo o `409` e a mensagem do modal, com
evidência em `evidence.md` sem CNPJ, IE, chave de acesso, razão social ou nome de lote de tenant real.
Sem migration, então `make migration-test` não faz parte do gate desta feature.
