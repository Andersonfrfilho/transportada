# Evidências — Feature 018

Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal aparece aqui.
Onde a stack local devolveu dado de tenant, ele está resumido em contagem ou substituído por
`<mascarado>`.

## T000 — Diagnóstico que originou a feature (2026-07-30)

Não é task do `tasks.md`: é a medição ao vivo que provou a causa antes de qualquer linha de código.

Sintoma relatado: o modal "Gerar CT-es" exibia "Não foi possível calcular a projeção. Tente
novamente." **junto** com a tabela de projeção preenchida e correta.

Reprodução com token real do `local-user` (login PKCE via Playwright, o mesmo caminho de
`test/authenticated-smoke.helper.ts`), chamando a API direto:

```
--- preview 200   (projeção calculada, 1 nota, sem bloqueios)
--- create  201   (nome novo → lote criado)
```

```
--- preview 200
--- create  500   {"error":{"code":"INTERNAL_ERROR","correlationId":"<mascarado>", ...}}
```

A única diferença entre as duas chamadas é o **nome do lote**: a segunda usou um nome já existente na
empresa. Com `createErrorResponse` instrumentado temporariamente (`console.error` do erro cru,
revertido em seguida — `git diff` limpo), o log da API mostrou:

```
DrizzleQueryError: Failed query: insert into "cte_batches" (...)
PostgresError: duplicate key value violates unique constraint "cte_batches_company_id_name_unique"
      errno: "23505"
     detail: Key (company_id, name)=(<mascarado>, <nome de lote mascarado>) already exists.
 constraint: "cte_batches_company_id_name_unique"
```

O que isso prova:

1. a projeção **não** falhou — `POST /cte-batches/preview` respondeu `200` nas duas tentativas;
2. o que falhou foi `POST /cte-batches`, por violação de unicidade não traduzida, virando `500`;
3. a mensagem do modal atribui à projeção uma falha da criação, porque
   `useCteEmissionDialog.hook.ts:113-119` colapsa `previewQuery.isError` e `createMutation.isError`
   no mesmo `status: 'error'`, e `CteEmissionDialog.component.tsx:144` só tem um texto;
4. identificar a rota exigiu instrumentar o handler à mão, porque `http_request_failed`
   (`http/response.service.ts:30`) loga apenas `correlationId`.

Estado do banco local depois do diagnóstico: os dois lotes criados durante a reprodução foram
removidos junto com seus itens, documentos, cobranças, eventos e cálculos de frete; a listagem de
lotes voltou às 4 linhas anteriores.

## T001 — Contrato falhando do repositório (2026-07-30)

Arquivo novo `apps/api-transportada/test/cte-batch-infrastructure/name-conflict.contract.ts`,
importado por `test/cte-batch-infrastructure.contract.test.ts` (entrypoint já listado no `test` do
`package.json`). O `database` é um duplo que rejeita o `insert` com a mesma cadeia do driver real:
`Error('Failed query: insert into "cte_batches"')` com `cause` carregando `constraint` e `errno`.

```
$ bun test test/cte-batch-infrastructure.contract.test.ts

(fail) CT-e batch creation name conflict contract > translates the batch name unique violation into a 409 domain error
       expect(received).toBeInstanceOf(expected)
       Expected constructor: [class ApiError extends Error]
       Received value: Failed query: insert into "cte_batches"
                       caused by: duplicate key value violates unique constraint
                        constraint: "cte_batches_company_id_name_unique", errno: "23505"

 22 pass
 1 fail
Ran 23 tests across 1 file.
```

Falha pelo motivo certo: a violação de unicidade do nome chega ao chamador crua, sem tradução. Os
outros três casos do arquivo — outra constraint, `sqlState` diferente de `23505` e erro sem detalhe
de Postgres — já passam, porque hoje nada é traduzido; eles existem para travar a regressão inversa
depois do T002 (o guard não pode capturar mais do que a constraint de nome).

## T002 — Guard e erro de domínio (2026-07-30)

- `src/cte-batches/domain/cte-batch.error.ts` ganhou `createBatchNameTakenError()`
  (`CTE_BATCH_NAME_TAKEN`, 409), no mesmo formato das demais `create*Error`.
- `src/cte-batches/infrastructure/drizzle-cte-batch.repository.ts`: constante
  `NAME_CONSTRAINT = 'cte_batches_company_id_name_unique'` (nome conferido em
  `src/database/cte-batch.schema.ts:73`) e `runGuarded` no molde de
  `drizzle-fleet-vehicle.repository.ts`, embrulhando **só** o `insert` de `createBatch`. A comparação
  é pelo nome da constraint via `violatedUniqueConstraint`, nunca pelo `sqlState` sozinho.
- `create-cte-batch.service.ts` não mudou.

```
$ bun test test/cte-batch-infrastructure.contract.test.ts
 23 pass
 0 fail
 52 expect() calls

$ bun run typecheck
$ bunx tsc --noEmit
(sem erros)
```

## T003 — Integração em Postgres real (2026-07-30)

Arquivo novo `apps/api-transportada/test/integration/cte-batch-name-conflict.integration.ts`,
registrado na lista **explícita** de `test:integration` no `package.json` da app. Roda em banco
descartável (`withDisposableDatabase` + `runDatabaseMigrations`), então o banco de desenvolvimento não
é tocado. Todos os dados são sintéticos: chave de acesso `<sufixo>` + 43 zeros, sem CNPJ, IE ou razão
social.

O teste reproduz a ordem de escrita real de `create-cte-batch.service.ts` (lote → cálculo de frete →
item → documento do item → cobrança → evento) e afirma, em uma única transação por lote:

1. segundo lote com o **mesmo nome** na mesma empresa → `ApiError` `CTE_BATCH_NAME_TAKEN` / `409`;
2. depois do erro, as contagens de `cte_batches`, `cte_batch_items`, `cte_batch_item_documents`,
   `cte_batch_item_charges` e `cte_batch_events` são idênticas às de antes da tentativa
   (`{batches: 1, items: 1, documents: 1, charges: 1, events: 1}`) — nada parcial sobrou;
3. **isolamento**: o mesmo nome em **outra** empresa é criação válida, e a empresa original continua
   com exatamente um lote.

```
$ set -a && . ./.env && set +a
$ bun test ./test/integration/cte-batch-name-conflict.integration.ts
bun test v1.3.14 (0d9b296a)
 1 pass
 0 fail
 7 expect() calls
Ran 1 test across 1 file. [596.00ms]
```

Ajuste durante a escrita: o primeiro rascunho usou `eventName: 'cte_batch.created'` e o Postgres
recusou com `cte_batch_events_name_check`; o nome correto é `'created'`, o mesmo que
`create-cte-batch.service.ts` grava.

## T004 — Contrato falhando do client (2026-07-30)

Teste novo dentro de `apps/frontend-transportada/test/cte-batch/client-and-queries.contract.ts`
(arquivo já na cadeia de `test/cte-batch.contract.test.ts`), com quatro cenários de resposta:
`409` com `error.code`, `500` com envelope sem `code`, `502` com corpo não-JSON e `201` com corpo
inválido.

```
$ bun test test/cte-batch.contract.test.ts

(fail) ... > surfaces the api error code of a failed create and falls back only without a readable code
       expect(received).toEqual(expected)
       -   "CTE_BATCH_NAME_TAKEN",
       +   "CTE_BATCH_REQUEST_FAILED",

 30 pass
 1 fail
```

Falha só no primeiro cenário: o client descartava o corpo e devolvia `CTE_BATCH_REQUEST_FAILED` para
qualquer resposta não-ok. Os outros três já passavam e ficam como trava de regressão do fallback.

## T005 — Client propagando o código (2026-07-30)

`src/modules/cte-batch/shared/cteBatchClient.service.ts`: `requestJson` passa a ler o corpo antes de
decidir e ganhou `readErrorCode`, no formato de `cteProfilesClient.service.ts:41-66` (type guard
manual, sem zod). Corpo ilegível em resposta não-ok continua caindo em `CTE_BATCH_REQUEST_FAILED`;
corpo ilegível em resposta ok continua sendo `CTE_BATCH_RESPONSE_INVALID`.

```
$ bun test test/cte-batch.contract.test.ts
 31 pass
 0 fail
 334 expect() calls

$ bun run test
 283 pass
 0 fail
 1587 expect() calls
Ran 283 tests across 14 files.
```

## T006 — Contrato falhando do modal (2026-07-30)

Cinco testes novos em `apps/frontend-transportada/test/nfe-workspace/cte-emission-dialog.contract.ts`
(arquivo já na cadeia de `test/nfe-workspace.contract.test.ts`), no bloco
`CT-e emission dialog failure contract`:

1. `resolveEmissionStatus` separa `previewError` de `createError` (e mantém `creating` e `loading`
   com precedência);
2. `selectEmissionMessageKey` escolhe `cteEmission.errorPreview`, `cteEmission.errorNameTaken`
   (só com `CTE_BATCH_NAME_TAKEN`) e `cteEmission.errorCreate`, e devolve `null` fora de erro;
3. `canConfirmEmission` continua `true` com projeção válida e `status: 'createError'` — o botão
   destrava depois de trocar o nome — e `false` com projeção vazia ou `previewError`;
4. varredura do componente: usa `selectEmissionMessageKey`, mantém a seção de projeção condicionada
   só a `dialog.summary !== null`, o `input` do nome não ganha `disabled`, e nem `t('cteEmission.error')`
   nem `dialog.status === 'error'` sobrevivem;
5. as duas locales têm **as mesmas chaves** em `cteEmission`, com `errorPreview`/`errorNameTaken`/
   `errorCreate` presentes e `error` ausente.

```
$ bun test test/nfe-workspace.contract.test.ts

# Unhandled error between tests
SyntaxError: Export named 'resolveEmissionStatus' not found in module
             '.../src/modules/nfe-workspace/shared/cteEmission.service.ts'.

 0 pass
 1 fail
 1 error
```

Falha pelo motivo certo: hoje o serviço não expõe nem `resolveEmissionStatus` nem
`selectEmissionMessageKey` — o hook colapsa os dois erros em `'error'` e o componente só tem um texto.

## T007 — Mensagem honesta no modal (2026-07-30)

- `shared/cteEmission.service.ts`: `CteEmissionStatus` passa a ter `previewError` e `createError` no
  lugar de `error`; `resolveEmissionStatus` concentra a precedência (`creating` → `previewError` →
  `createError` → `loading` → `ready`); `selectEmissionMessageKey` devolve a chave de locale;
  `canConfirmEmission` aceita `createError`, então o botão volta a ficar disponível depois de trocar
  o nome. A constante `BATCH_NAME_TAKEN_CODE` guarda o código que vem do client.
- `hooks/useCteEmissionDialog.hook.ts`: o ternário aninhado que colapsava os dois erros virou uma
  chamada a `resolveEmissionStatus`; `errorCode` continua exposto como estava.
- `components/CteEmissionDialog.component.tsx`: o parágrafo único de erro passou a renderizar
  `t(messageKey)` com a chave escolhida por `selectEmissionMessageKey`. A seção de projeção continua
  condicionada só a `dialog.summary !== null` — a tabela permanece na tela durante o erro de criação —
  e o `input` do nome segue sem `disabled`.
- Locales: `cteEmission.error` foi substituída por `errorPreview`, `errorNameTaken` e `errorCreate`
  nos dois arquivos, com as mesmas chaves dos dois lados.

```
$ bun test test/nfe-workspace.contract.test.ts
 87 pass
 0 fail
 271 expect() calls

$ bun run test
 288 pass
 0 fail
 1616 expect() calls
Ran 288 tests across 14 files.

$ bun run typecheck
$ tsc --noEmit
(sem erros)

$ bun run lint
$ eslint .
(sem erros)
```

Varredura provando que a chave antiga sumiu:

```
$ rg -n "cteEmission\.error" src/
src/modules/nfe-workspace/shared/cteEmission.service.ts:161:  if (input.status === 'previewError') return 'cteEmission.errorPreview'
src/modules/nfe-workspace/shared/cteEmission.service.ts:164:    ? 'cteEmission.errorNameTaken'
src/modules/nfe-workspace/shared/cteEmission.service.ts:165:    : 'cteEmission.errorCreate'
```

Nenhuma referência a `cteEmission.error` sobrou. As chaves `"error"` que ainda aparecem nas locales do
módulo pertencem a outras subárvores (`status`, workspace e upload), fora de `cteEmission` — o teste
de paridade compara exatamente a subárvore `cteEmission` dos dois arquivos.

## T008 — Contrato falhando do 500 auditável (2026-07-30)

Teste novo em `apps/api-transportada/test/http.contract.test.ts` (arquivo já na lista explícita do
`package.json`), no molde das asserções de vazamento que o arquivo já tinha: a autenticação rejeita
com a cadeia sintética `DrizzleQueryError` → `PostgresError` (`constraint`, `errno: '23505'` e uma
`message` carregando um valor reconhecível), e o teste exige `500` genérico mais uma linha de log com
`errorName`, `sqlState` e `constraint` — e proíbe a `message`, o valor reconhecível e o token no log.

```
$ bun test test/http.contract.test.ts

(fail) API HTTP contracts > logs the shape of an unexpected database failure without leaking its message
       expect(received).toContainEqual(expected)
       Expected to contain: ObjectContaining {
         constraint: "cte_batches_company_id_name_unique",
         correlationId: "<correlation-id de teste>",
         errorName: "DrizzleQueryError",
         sqlState: "23505",
       }
       Received: [
         { correlationId: "<correlation-id de teste>" },
         { correlationId: "<correlation-id de teste>", durationMs: ..., method: "GET",
           pathname: "<unmatched>", status: 500 }
       ]

 14 pass
 1 fail
```

Falha pelo motivo certo: `http_request_failed` (`src/http/response.service.ts:30`) hoje loga só
`correlationId` — é exatamente o que obrigou a instrumentar o handler à mão no T000. As asserções de
não-vazamento já passam e ficam como trava: o que entrar no log a partir do T009 não pode trazer
mensagem nem parâmetro de query.

## T009 — `describeErrorForLog` (2026-07-30)

Arquivo novo `apps/api-transportada/src/logging/error-descriptor.service.ts`, sobre o
`findPostgresError` de `src/database/postgres-error.support.ts`. Devolve **só**
`{ errorName, constraint?, sqlState? }` — `message`, `stack`, `detail` e parâmetro de query nunca
entram no objeto, então não há como vazarem pelo log. `errorName` sai do erro externo (é o
`DrizzleQueryError` que identifica a camada), `constraint`/`sqlState` saem do `PostgresError` aninhado;
sem erro reconhecível, `errorName` cai em `'UnknownError'` e os outros dois ficam ausentes.

`src/http/response.service.ts:30` passou a compor a metadata do `http_request_failed` com
`{ correlationId, ...describeErrorForLog(error) }`. O envelope da resposta não mudou: continua
`INTERNAL_ERROR` genérico com o `correlationId`.

```
$ bun test test/http.contract.test.ts
 15 pass
 0 fail
 57 expect() calls

$ bun run test
 1149 pass
 1 skip
 0 fail
 5365 expect() calls
Ran 1150 tests across 61 files.

$ bun run typecheck
$ bunx tsc --noEmit
(sem erros)

$ bun run lint
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0
(sem erros)
```

O `lint` acusou um import morto (`freightCalculations`) deixado no arquivo de integração do T003;
removido, e o teste de integração continua verde.

## T010 — gate completo e verificação ao vivo (2026-07-30)

### Gate

```
$ make check
format:check  ok
lint          ok
typecheck     ok
test          6 pass · 1149 pass · 228 pass · 24 pass · 288 pass · 0 fail
build         api, worker, frontend e smoke ok
```

O `format:check` só passou depois de `.omc/` entrar no `.gitignore` — o Prettier 3 respeita o
`.gitignore` e estava tentando checar o estado de sessão do OMC, que não é código do repo.

### (a) e (c) — API respondendo 409 e criação passando ao renomear

Stack local (`make dev`), token obtido pelo login real no Keycloak (senha só via
`KEYCLOAK_LOCAL_USER_PASSWORD`, nunca digitada nem impressa). Script temporário, já removido, faz
quatro chamadas em sequência com `idempotency-key` distinta e nomes prefixados `t018-verificacao-`:

```
notas elegíveis encontradas: 3
1) criação com nome novo            -> 201 ok
2) criação com nome repetido        -> 409 CTE_BATCH_NAME_TAKEN
3) criação após renomear            -> 201 ok
4) corrida na mesma idempotency-key -> 500 INTERNAL_ERROR | 201 ok
```

A linha 4 é proposital: duas requisições concorrentes com a **mesma** `idempotency-key` e nomes
diferentes passam juntas pela pré-checagem e a perdedora viola
`cte_batches_company_id_idempotency_key_unique`. Ela continua sendo `500`, o que prova que o guard
novo é escopado pela constraint de **nome** e não engoliu o `23505` inteiro.

### (b) — modal com a mensagem de nome em uso e a projeção na tela

Roteiro Playwright temporário (já removido) no frontend de verdade em `localhost:53000`: login,
seleção de uma nota elegível, criação de um lote, e depois uma segunda nota com o **mesmo** nome.

```
1) primeiro lote criado, diálogo fechou            -> ok
2) mensagem de nome em uso visível                 -> ok
3) projeção continua na tela após o erro           -> ok
4) campo de nome continua editável                 -> ok
5) botão de confirmar continua habilitado          -> ok
6) criação passa ao corrigir o nome                -> ok
```

O passo 2 casa com o texto exato de `cteEmission.errorNameTaken`
("Já existe um lote com esse nome. Escolha outro nome para criar o lote."), não mais com a mensagem
de projeção que o usuário viu no relato original. O passo 3 confirma o cabeçalho `CT-es projetados`
e pelo menos uma linha de projeção ainda renderizados; o 4 e o 5 confirmam que dá para corrigir o
nome ali mesmo, sem fechar e reabrir o diálogo. Captura de tela usada só para conferência visual
durante a verificação e apagada em seguida — não foi versionada, porque mostra dados de tenant.

### (d) — `http_request_failed` auditável

O logger só emite `meta` quando `pretty: false`, e `main.ts:148` liga `pretty` em todo `APP_ENV`
diferente de `production`. Para ver a linha real sem mexer na stack do dia a dia, subi uma instância
descartável da API (`APP_ENV=production APP_PORT=53011`, encerrada ao fim da verificação — `appEnv`
na API só decide `pretty` e o campo do `api_started`) e repeti a corrida da linha 4:

```json
{
  "timestamp": "...",
  "level": "ERROR",
  "message": "http_request_failed",
  "meta": {
    "correlationId": "<uuid>",
    "constraint": "cte_batches_company_id_idempotency_key_unique",
    "errorName": "DrizzleQueryError",
    "sqlState": "23505"
  }
}
```

`errorName`, `sqlState` e `constraint` presentes; nenhuma `message`, `stack`, `detail` ou parâmetro
de query. O corpo devolvido ao cliente segue o `INTERNAL_ERROR` genérico com o `correlationId`.

### Limpeza

Os 8 lotes criados durante a verificação (`t018-verificacao-*` e `t018-ui-*`) foram apagados com o
grafo inteiro em uma transação — `cte_batch_item_charges`, `cte_batch_item_documents`,
`cte_batch_events`, `cte_batch_items` e `cte_batches`, 8 linhas em cada; as tabelas de emissão,
faturamento e outbox não tinham nada, porque nenhum lote chegou a ser transmitido.
`select count(*) from cte_batches where name like 't018-%'` devolve `0`. A instância da porta 53011
foi encerrada e os scripts temporários apagados (`git status` limpo desses artefatos).

## Pós-feature — 409 de nota já vinculada e projeção servida do cache

Dois defeitos achados no mesmo teste manual, encadeados no mesmo ciclo:

1. `createBlockError` devolve **409 `CTE_BATCH_DOCUMENT_ALREADY_LINKED`**
   (`cte-batch.error.ts:14-20,79-80`) quando uma nota entrou em outro CT-e depois da projeção. O
   cliente transforma o `error.code` do corpo em `Error.message`
   (`cteBatchClient.service.ts:98-107,125`), mas `selectEmissionMessageKey` só tratava
   `CTE_BATCH_NAME_TAKEN` — todo o resto caía em `cteEmission.errorCreate`, "Não foi possível criar o
   lote. **Tente novamente**". Conselho errado: repetir com a mesma seleção falha para sempre.
2. A projeção era cacheada por `[..., input.documentIds, ...]` e nunca invalidada depois de criar o
   lote. Com `staleTime` de 30 s, reabrir o diálogo sobre as mesmas notas devolvia a projeção
   anterior — as notas apareciam projetáveis mesmo já presas ao lote novo, e o `suggestedName` da
   018/019 vinha do estado anterior, já tomado. Confirmar dali cai direto no defeito 1.

### Correção

- `selectEmissionMessageKey` passou a resolver por mapa (`CREATE_ERROR_MESSAGE_KEYS`), com
  `cteEmission.errorAlreadyLinked` nos dois locales dizendo o que houve e que a projeção foi
  refeita. `errorCreate` continua sendo o destino de todo código sem tratamento próprio.
- `CTE_EMISSION_PREVIEW_QUERY_KEY` saiu do hook para o serviço e ganhou `buildPreviewQueryKey`, que
  deduplica os `documentIds` — duas seleções que geram a **mesma** requisição passam a compartilhar
  uma entrada de cache em vez de duas.
- O hook invalida **todas** as projeções (`queryKey: [CTE_EMISSION_PREVIEW_QUERY_KEY]`, prefixo, não
  a chave corrente) ao criar o lote e, via `shouldRefreshPreviewAfterFailure`, quando a criação falha
  por vínculo. Invalidar só a chave atual deixaria as outras seleções projetando notas já presas.
  Nome repetido não invalida nada: a projeção continua válida e refazê-la só cobraria a API.

Como o frontend não tem DOM nem testing-library, a decisão ficou em funções puras no serviço e o
teste do hook é de texto de módulo, como o resto da suíte.

### Prova

Teste antes da implementação — vermelho por `Export named 'shouldRefreshPreviewAfterFailure' not
found`, depois verde:

```
$ bun test apps/frontend-transportada/test/nfe-workspace.contract.test.ts
 94 pass / 0 fail
$ bun run --cwd apps/frontend-transportada test
 346 pass / 0 fail / 1976 expect() calls   [169ms]
$ bun run lint · bun run typecheck · build   # silenciosos; PWA gerado
```

Mutação, para provar que as asserções mordem: voltando `selectEmissionMessageKey` ao ternário
antigo e trocando a chave invalidada por uma inexistente, caem exatamente os dois testes novos
(92 pass / 2 fail) — "says the note went into another CT-e instead of asking for a retry that never
works" e "drops every cached projection when a batch is created". Fonte restaurada e reconferida
(94 pass, `prettier --check` limpo).

Nenhuma query mudou e nada novo é lido do servidor: a correção é de cache do cliente e de texto.
