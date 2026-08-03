# Evidências — Feature 019

Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal aparece aqui.
Onde a stack local devolveu dado de tenant, ele está resumido em contagem ou substituído por
`<mascarado>`.

## T001 — Contrato falhando da regra pura (2026-07-30)

Arquivo novo `apps/api-transportada/test/cte-batch-domain/batch-name.contract.ts`, importado por
`test/cte-batch-domain.contract.test.ts` (entrypoint já listado no `test` do `package.json`). Cinco
testes: o prefixo em três instantes (meio-dia UTC, 22h em São Paulo com o dia UTC já virado, e 23h do
dia anterior em São Paulo), sequência inicial, `max + 1` com buraco e com dois dígitos, nomes sem
sequência limpa ignorados, e a mistura de válidos com inválidos.

```
$ bun test test/cte-batch-domain.contract.test.ts

# Unhandled error between tests
error: Cannot find module '../../src/cte-batches/domain/cte-batch-name.service.js'

 0 pass
 1 fail
 1 error
```

Falha pelo motivo certo: o módulo da regra ainda não existe. Como o contrato importa as duas funções
por nome, o erro é de módulo inteiro — as asserções individuais só aparecem depois do T002.

## T002 — Regra pura implementada (2026-07-30)

Arquivo novo `apps/api-transportada/src/cte-batches/domain/cte-batch-name.service.ts`, sem I/O:

- `buildBatchNamePrefix({ now })` formata com um `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`
  construído uma vez no módulo — `en-CA` já entrega `YYYY-MM-DD`, então não há remontagem de partes de
  data à mão.
- `suggestBatchName({ names, prefix })` lê o sufixo dos nomes que começam com o prefixo, aceita **só**
  dígitos sem zero à esquerda (`PLAIN_SEQUENCE`), trata tudo o mais como `0` e devolve
  `maior + 1` — o que dá `#1` quando nenhum nome é válido, sem precisar de caso especial para lista
  vazia.

```
$ bun test test/cte-batch-domain.contract.test.ts
 9 pass
 0 fail
 19 expect() calls

$ bun run typecheck
$ bunx tsc --noEmit
(sem erros)
```

Nada está ligado ao use-case ainda: o contrato do preview continua sendo `{ blocked, projections, summary }`.

## T003 — Contrato falhando do guard de preview (2026-07-30)

Caso novo `carries the batch name suggested by the api and survives its absence` em
`apps/frontend-transportada/test/cte-batch/client-and-queries.contract.ts` (arquivo já na cadeia
explícita do `package.json` via `test/cte-batch.contract.test.ts`). Quatro asserções: resposta com
`suggestedName: 'CT-e 2026-07-30 #2'` chega ao objeto validado; resposta sem o campo vira `''`;
`suggestedName` numérico rejeita; chave desconhecida na raiz (`companyId`) continua rejeitando.

```
$ bun run --cwd apps/frontend-transportada test/cte-batch.contract.test.ts

error: CTE_BATCH_INVALID_PREVIEW_RESPONSE
      at rejectExtraKeys (src/modules/cte-batch/shared/cteBatchPreview.validation.ts:47:75)
      at <anonymous> (src/modules/cte-batch/shared/cteBatchPreview.validation.ts:133:5)
      at <anonymous> (test/cte-batch/client-and-queries.contract.ts:293:23)
(fail) CT-e batch client and queries contract > carries the batch name suggested by the api and survives its absence

 31 pass
 1 fail
 334 expect() calls
```

Falha pelo motivo certo e prova o risco de deploy que ordena as fases: com o guard de hoje, uma API
que passasse a emitir `suggestedName` derrubaria a tela inteira no `rejectExtraKeys` da raiz. Os 31
testes que já passavam continuam verdes — nenhum deles regrediu.

## T004 — Guard tolerante ao campo novo (2026-07-30)

- `cteBatchPreview.types.ts`: `CteBatchPreview` ganha `suggestedName: string` — sempre presente
  depois do guard, mesmo quando a API não manda nada.
- `cteBatchPreview.validation.ts`: `suggestedName` entra na allowlist da raiz e é lido por
  `readOptionalString` — `undefined` vira `''`, string passa, qualquer outro tipo cai em
  `CTE_BATCH_INVALID_PREVIEW_RESPONSE`. Chave desconhecida na raiz continua rejeitando.
- Fixtures alinhadas ao contrato da API: `CTE_SUGGESTED_BATCH_NAME` em
  `test/cte-batch/cte-batch.fixture.ts` e o campo nos dois `CteEmissionPreview` de
  `test/nfe-workspace/`. Nomes de lote sintéticos, sem dado de tenant.

```
$ bun run --cwd apps/frontend-transportada test/cte-batch.contract.test.ts
 32 pass
 0 fail
 338 expect() calls

$ bun run --cwd apps/frontend-transportada typecheck
$ tsc --noEmit
(sem erros)

$ bun run --cwd apps/frontend-transportada test
 289 pass
 0 fail
 1620 expect() calls
Ran 289 tests across 14 files.

$ bun run --cwd apps/frontend-transportada lint
$ eslint .
(sem erros)
```

O frontend já aceita a resposta com `suggestedName` **antes** da API emitir — a ordem que evita
derrubar a tela no deploy. Nada no modal usa o campo ainda; isso é a Fase D.

## T005 — Contrato falhando do use-case de preview (2026-07-30)

Dois casos novos em `apps/api-transportada/test/cte-batch-application/preview.contract.ts` e o duplo
de `preview-support.ts` ampliado: relógio fixo `PREVIEW_NOW` (meio-dia UTC de 30/07/2026, mesmo dia em
São Paulo) injetado como `clock` na fábrica, `batchNames` no reader falso e `findBatchNamesStartingWith`
registrando as consultas em `nameQueries`. O teste de isolamento que já existia passou a listar o
terceiro método de leitura do reader — a superfície continua só de leitura, sem nenhuma escrita.

```
$ bun test test/cte-batch-application.contract.test.ts

error: expect(received).toBe(expected)
Expected: "CT-e 2026-07-30 #4"
Received: undefined
(fail) CT-e batch preview projection > suggests the next batch name of the day without touching the rest of the envelope

error: expect(received).toBe(expected)
Expected: "CT-e 2026-07-30 #1"
Received: undefined
(fail) CT-e batch preview projection > suggests the first name of the day when the company has no batch yet

 47 pass
 2 fail
 273 expect() calls
```

Falha pelo motivo certo: o use-case ainda não devolve `suggestedName`. `blocked`, `projections` e
`summary` continuam idênticos nos dois casos, e a asserção sobre `nameQueries`
(`{ companyId, prefix }`) já está escrita para provar que a consulta nasce do contexto autenticado.

## T006 — API emitindo a sugestão (2026-07-30)

- `cte-batch-preview.port.ts`: `CteBatchNameQuery = { companyId, prefix }`,
  `findBatchNamesStartingWith` no `CteBatchPreviewReaderPort`, `suggestedName: string` em
  `CteBatchPreviewResult` e o port de relógio `CteBatchClockPort = { now(): Date }`.
- `preview-cte-batch.use-case.ts`: monta o prefixo com `buildBatchNamePrefix({ now: clock.now() })` e
  soma a consulta de nomes ao `Promise.all` que já existia — quatro leituras em paralelo, nenhuma
  ida a mais no relógio de parede da requisição.
- `cte-batch-selection.query.ts`: `findBatchNamesByPrefix` filtra por `companyId` **e**
  `like(name, prefixo%)`, com `escapeLike` neutralizando `%`, `_` e `\` (Postgres usa `\` como escape
  padrão do LIKE). Sem filtro de status: o unique `cte_batches_company_id_name_unique` vale para lote
  cancelado também, então ele tem de entrar na sequência.
- `drizzle-cte-batch-preview.repository.ts` delega; `main.ts` injeta `clock: { now: () => new Date() }`
  no `createPreviewCteBatchUseCase`. A rota não mudou — o `handle` já serializa o resultado inteiro.

```
$ bun run --cwd apps/api-transportada test/cte-batch-application.contract.test.ts
 49 pass
 0 fail
 277 expect() calls

$ bun run --cwd apps/api-transportada typecheck
$ bunx tsc --noEmit
(sem erros)

$ bun run --cwd apps/api-transportada lint
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0
(sem erros)

$ bun run --cwd apps/api-transportada test
 1156 pass
 1 skip
 0 fail
 5381 expect() calls
Ran 1157 tests across 61 files.
```

Suíte inteira da API verde, incluindo os contratos HTTP do preview — o campo novo entra no envelope
sem quebrar nenhum consumidor já testado. A prova em Postgres real (sequência subindo e isolamento
entre empresas) é o T007.

## T007 — Integração em Postgres real (2026-07-30)

Arquivo novo `apps/api-transportada/test/integration/cte-batch-suggested-name.integration.ts`,
registrado na lista **explícita** de `test:integration` no `package.json` da app. Roda em banco
descartável (`withDisposableDatabase` + `runDatabaseMigrations`), com o use-case real ligado ao
`DrizzleCteBatchPreviewRepository` e relógio fixo em 30/07/2026 — a sugestão vem do caminho completo
(use-case → port → query), não de uma composição só de teste.

O que o teste prova, na ordem:

1. empresa sem lote nenhum → `#1`;
2. depois de gravar `#1` → `#2`; depois de `#2` → `#3` (a sequência sobe de verdade no banco);
3. `Lote da manha`, `CT-e 2026-07-29 #9` (outro dia) e `CT-e 2026-07-30 #2 revisado` não movem nada —
   continua `#3`;
4. **isolamento**: a segunda empresa começa em `#1` com a primeira já em `#3`, e depois de gravar o
   `#1` dela vai para `#2` enquanto a primeira permanece em `#3`.

```
$ DRIZZLE_TEST_DATABASE_URL="$DATABASE_URL" bun test ./test/integration/cte-batch-suggested-name.integration.ts
 1 pass
 0 fail
 7 expect() calls
Ran 1 test across 1 file. [546.00ms]

$ bun run --cwd apps/api-transportada typecheck
$ bunx tsc --noEmit
(sem erros)

$ bun run --cwd apps/api-transportada lint
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0
(sem erros)
```

`DATABASE_URL` veio do `.env` por `set -a && . ./.env && set +a` — nada do conteúdo do arquivo foi
impresso. O banco descartável (`transportada_t019_<uuid>`) é derrubado no `finally`, então a stack
local ficou sem resíduo.

## T008 — Contrato falhando do modal (2026-07-30)

Dois casos novos em `apps/frontend-transportada/test/nfe-workspace/cte-emission-dialog.contract.ts`:
a precedência de `resolveBatchName({ customName, fallbackName, suggestedName })` — digitado (inclusive
string vazia, porque apagar o campo é escolha do operador) → sugestão da API → fallback local — e a
varredura provando que o hook deriva o nome em render, sem `useEffect`.

```
$ bun run --cwd apps/frontend-transportada test/nfe-workspace.contract.test.ts

# Unhandled error between tests
SyntaxError: Export named 'resolveBatchName' not found in module 'src/modules/nfe-workspace/shared/cteEmission.service.ts'

 0 pass
 1 fail
 1 error
```

Falha pelo motivo certo: a função ainda não existe. Como o contrato a importa por nome, o erro é de
módulo inteiro — as asserções individuais só aparecem depois do T009.

## T009 — Modal usando a sugestão (2026-07-30)

- `cteEmission.service.ts`: `resolveBatchName({ customName, fallbackName, suggestedName })` —
  `customName: null` é "o operador ainda não escreveu nada"; string vazia já é escolha dele e vence a
  sugestão. `defaultBatchName` continua existindo como fallback local para quando a API não sugere.
- `useCteEmissionDialog.hook.ts`: o estado virou `customName: null | string` + `fallbackName` fixado
  no `open()`; o `name` exposto é **derivado em render** por `resolveBatchName` a partir de
  `preview?.suggestedName`, sem nenhum `useEffect`. `setName` grava `customName`, então trocar o
  agrupamento (que refaz o preview) não sobrescreve o que o operador digitou.
- `CteEmissionDialog.component.tsx` não mudou — continua lendo `dialog.name` e `dialog.setName`.

```
$ bun run --cwd apps/frontend-transportada test/nfe-workspace.contract.test.ts
 89 pass
 0 fail
 277 expect() calls

$ bun run --cwd apps/frontend-transportada test
 291 pass
 0 fail
 1626 expect() calls
Ran 291 tests across 14 files.

$ bun run --cwd apps/frontend-transportada typecheck
$ tsc --noEmit
(sem erros)
```

## T010 — Gate completo e verificação ao vivo (2026-07-30)

### Gate

```
$ make check
 6 pass / 0 fail        (cron-transportada)
 1156 pass / 0 fail     (api-transportada)
 228 pass / 0 fail      (worker-transportada)
 24 pass / 0 fail       (api-transportada — contratos de smoke/segurança)
 291 pass / 0 fail      (frontend-transportada)
format:check · lint · typecheck · build — todos verdes (api 197 módulos, worker 90, cron 23,
frontend `vite build` 312 módulos + PWA `generateSW` com 11 entradas de precache)
```

### Verificação ao vivo

Stack local em pé (`postgres`, `rabbitmq`, `keycloak`, `minio`, `mailpit` + API `:53001`,
frontend `:53000`). O login foi feito **pelo Playwright** (`loginAsLocalUser`, senha lida de `.env`,
nunca digitada nem impressa). Spec temporária dirigindo o navegador contra a API real, removida
depois da verificação — sem arquivo novo no repo e sem mock de rede:

```
$ bunx playwright test --config t010.playwright.config.ts
[t010] sequencia observada: #1 -> #2; tentativas: 201,201,409
  ✓  1 test/t010-live.smoke.spec.ts › a sugestao de nome sobe sozinha, sobrevive a edicao e o
     nome repetido ainda cai em 409 (3.0s)
  1 passed
```

O que cada asserção provou, na ordem da task:

- **(a)** ao abrir o modal com uma nota selecionada, o campo "Nome do lote" já vem preenchido e casa
  com `/^CT-e \d{4}-\d{2}-\d{2} #(\d+)$/` — o valor observado foi `CT-e 2026-07-30 #1`. Os 4 lotes
  que já existiam na base usam o formato antigo `(n)`, então a sequência `#` começa em `#1` sem
  colidir com nenhum deles.
- **(b)** duas emissões seguidas no mesmo dia: a primeira criou `#1`, e ao reabrir o modal com outra
  nota a sugestão já veio `#2`, que também foi criado. As duas chamadas `POST /cte-batches` foram
  interceptadas e responderam **201** — nenhum `409` no caminho feliz.
- **(c)** com um nome digitado à mão, trocar o agrupamento para "Agrupar por remetente e
  destinatário" e voltar para "Um CT-e por nota" (cada troca refaz o preview) manteve exatamente o
  texto digitado no campo. Fechar e reabrir o modal devolve o campo para a sugestão da API — o
  `open()` limpa o que o operador escreveu, como previsto.
- **(d)** digitando `CT-e 2026-07-30 #2` (nome já usado) numa terceira seleção, o `POST` respondeu
  **409** e o modal exibiu a mensagem da 018: "Já existe um lote com esse nome. Escolha outro nome
  para criar o lote." — o campo manteve o texto digitado para o operador corrigir.

Sequência completa das tentativas de criação capturadas no navegador: `201, 201, 409`.

### Limpeza

Os dois lotes criados na verificação foram apagados do banco local, junto das linhas dependentes
(`cte_batch_events`, `cte_batch_item_documents`, `cte_batch_item_charges`, `cte_batch_items`):

```
DELETE 2 (events) · DELETE 2 (item_documents) · DELETE 2 (item_charges) · DELETE 2 (items) ·
DELETE 2 (batches) · COMMIT

remaining_suggested_batches | 0
total_batches               | 4    (mesmo total de antes da verificação)
linked_documents            | 4    (mesmo total de antes da verificação)
```

Nenhum CNPJ, IE, chave de acesso, número de nota real ou nome de lote de tenant real foi registrado
aqui: os únicos nomes citados são os que a própria verificação gerou.
