# Tasks

Feature 019 — Nome de lote sugerido sem colisão.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); teste de isolamento de tenant sempre que a
task mexer em query; task só fecha com evidência em `evidence.md` (comando, saída, o que prova).
Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real, nome de lote de tenant real
ou XML fiscal em teste, fixture, log ou evidência.

`[P]` = pode rodar em paralelo com a anterior sem tocar nos mesmos arquivos.

## Fase A — Regra pura da sugestão (api)

> 🤖 Modelo: `sonnet`

- [x] T001 Teste de contrato **falhando** do domínio, cobrindo as duas funções separadamente:
      `buildBatchNamePrefix({ now })` devolve `CT-e <YYYY-MM-DD> #` com a data em `America/Sao_Paulo`
      — incluindo um instante UTC que já é o dia seguinte lá (`2026-07-31T01:00:00Z` → `2026-07-30`)
      e um que ainda é o dia anterior (`2026-07-30T02:00:00Z` → `2026-07-29`); `suggestBatchName({ names, prefix })`
      devolve `#1` para lista vazia, `max + 1` com buracos na sequência (`#1`, `#3` → `#4`), ignora
      nome de outro dia, ignora sufixo não numérico (`#2 revisado`, `#`, `#2.5`) e ignora nome sem o
      prefixo — `apps/api-transportada/test/cte-batch-domain/batch-name.contract.ts` (novo) +
      `import` em `apps/api-transportada/test/cte-batch-domain.contract.test.ts` — evidência: saída do
      `bun test` com o arquivo novo listado e falhando pelo motivo certo.

- [x] T002 Implementar `apps/api-transportada/src/cte-batches/domain/cte-batch-name.service.ts`
      (novo, sem I/O): constante `FISCAL_TIME_ZONE = 'America/Sao_Paulo'`, `buildBatchNamePrefix` com
      `Intl.DateTimeFormat('en-CA', { timeZone })` e `suggestBatchName` com `max + 1`. Nada é ligado
      ao use-case ainda — evidência: T001 verde + `bun run typecheck`.

## Fase B — Frontend aceitando o campo novo (frontend)

> 🤖 Modelo: `sonnet`
>
> ⚠️ Esta fase vem **antes** da API emitir o campo: `rejectExtraKeys` na raiz do preview
> (`cteBatchPreview.validation.ts:130`) derrubaria a tela inteira se a resposta ganhasse
> `suggestedName` com o guard desatualizado.

- [x] T003 Teste de contrato **falhando** do guard de preview: resposta com `suggestedName: 'CT-e 2026-07-30 #2'`
      é aceita e o campo chega ao objeto validado; resposta **sem** o campo é aceita e vira `''`;
      `suggestedName` de tipo errado (número) rejeita com `CTE_BATCH_INVALID_PREVIEW_RESPONSE`; chave
      desconhecida na raiz continua rejeitando —
      `apps/frontend-transportada/test/cte-batch/client-and-queries.contract.ts` (existente) —
      evidência: saída falhando.

- [x] T004 Implementar em `apps/frontend-transportada/src/modules/cte-batch/shared/`:
      `cteBatchPreview.types.ts` ganha `suggestedName: string` em `CteBatchPreview`, e
      `cteBatchPreview.validation.ts` acrescenta a chave à allowlist da raiz com leitura tolerante
      (string vira string, ausente vira `''`, outro tipo rejeita) — evidência: T003 verde +
      `bun run typecheck`.

## Fase C — API emitindo a sugestão (api)

> 🤖 Modelo: `sonnet`

- [x] T005 Teste de contrato **falhando** do use-case de preview: com o reader falso devolvendo
      `['CT-e 2026-07-30 #1', 'CT-e 2026-07-30 #3', 'rascunho']` e relógio fixo em `2026-07-30`, o
      resultado traz `suggestedName: 'CT-e 2026-07-30 #4'`; com o reader devolvendo lista vazia, traz
      `#1`; `blocked`, `projections` e `summary` continuam idênticos aos casos que o arquivo já cobre;
      o reader recebe o `companyId` do contexto autenticado —
      `apps/api-transportada/test/cte-batch-application/preview.contract.ts` (existente) e o duplo em
      `preview-support.ts` — evidência: saída falhando.

- [x] T006 Implementar a emissão: `cte-batch-preview.port.ts` ganha
      `findBatchNamesStartingWith({ companyId, prefix })` no `CteBatchPreviewReaderPort`,
      `suggestedName: string` em `CteBatchPreviewResult` e o port de relógio
      `CteBatchClockPort = { now(): Date }`; `preview-cte-batch.use-case.ts` monta o prefixo e soma a
      consulta ao `Promise.all` existente; `cte-batch-selection.query.ts` ganha
      `findBatchNamesByPrefix` filtrando por `companyId` com o prefixo escapado para `LIKE`;
      `drizzle-cte-batch-preview.repository.ts` delega; `main.ts` injeta
      `clock: { now: () => new Date() }`. A rota não muda — **mexe em query multi-tenant, isolamento
      obrigatório (T007)** — evidência: T005 verde + `bun run typecheck` + `bun run lint`.

- [x] T007 Teste de integração em Postgres real, no molde de
      `test/integration/cte-batch-name-conflict.integration.ts` (`withDisposableDatabase` +
      `runDatabaseMigrations`): criar lotes e afirmar que a sequência sugerida sobe (`#1` → `#2` →
      `#3`), que um lote com nome fora do padrão não interfere, e — **isolamento** — que duas
      empresas com lotes do mesmo dia recebem sequências independentes (a segunda empresa continua em
      `#1` mesmo com a primeira em `#3`) —
      `apps/api-transportada/test/integration/cte-batch-suggested-name.integration.ts` (novo),
      registrado na lista **explícita** de `test:integration` no `package.json` da app — evidência:
      saída do `bun test` com `DRIZZLE_TEST_DATABASE_URL` apontando para o Postgres local.

## Fase D — Modal usando a sugestão (frontend)

> 🤖 Modelo: `sonnet`

- [x] T008 Teste de contrato **falhando** do modal: `resolveBatchName({ customName, fallbackName, suggestedName })`
      devolve o nome digitado quando há um (mesmo string vazia — apagar o campo é escolha do
      operador), a sugestão quando não há digitado, e o `fallbackName` quando não há nem digitado nem
      sugestão; e varredura provando que o hook não usa `useEffect` para preencher o nome —
      `apps/frontend-transportada/test/nfe-workspace/cte-emission-dialog.contract.ts` (existente) —
      evidência: saída falhando.

- [x] T009 Implementar: `resolveBatchName` em
      `apps/frontend-transportada/src/modules/nfe-workspace/shared/cteEmission.service.ts`; em
      `.../hooks/useCteEmissionDialog.hook.ts` o estado vira `customName: string | null` +
      `fallbackName` fixado no `open()`, o `name` exposto passa a ser derivado em render por
      `resolveBatchName` (sem `useEffect`), `setName` grava `customName` e `open()` volta os dois ao
      estado inicial. `CteEmissionDialog.component.tsx` não muda — evidência: T008 verde +
      `bun run --cwd apps/frontend-transportada test`.

## Fase E — Fechamento

> 🤖 Modelo: `sonnet`

- [x] T010 Gate completo e verificação ao vivo: `make check` e, na stack local, provar (a) que o modal
      abre com `CT-e <data> #<n>` já preenchido, (b) que duas emissões seguidas no mesmo dia criam
      `#n` e `#n+1` sem nenhum `409`, (c) que um nome digitado à mão sobrevive à troca de agrupamento,
      e (d) que digitar um nome já usado continua caindo no `409 CTE_BATCH_NAME_TAKEN` com a mensagem
      da 018 — evidência em `specs/019-cte-batch-suggested-name/evidence.md`, sem dado fiscal real, e
      limpeza de todo lote criado na verificação.
