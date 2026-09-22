# Evidência — Fases 2 e 3 (T201-T309)

Executado nesta sessão: branch `work/spec-167`, worktree
`/private/tmp/claude-502/.../scratchpad/wt166`. Fase 1 (T101-T103) já estava publicada por outra
sessão ao início desta.

## T201 — Migration

`bun run db:generate --name occurrence_correction_and_cancellation` gerou
`drizzle/20260922221701_occurrence_correction_and_cancellation/` (migration + rollback +
snapshot). Carimbo **provisório** — a Fase 5 (T503) deve rodar `bun run db:generate` de novo após
o rebase em `origin/staging`, até `no_changes`, e renumerar antes de publicar.

```
$ make migration-test
...
 110 pass
 0 fail
 1417 expect() calls
Ran 110 tests across 8 files. [42.93s]
```

CA01 (aplica e reverte em Postgres descartável) confirmado por
`test/database-migration/static-migration.contract.ts`.

## T202/T203 — Políticas de domínio

`occurrence-correction.policy.ts` (o que conta como mudança — RF5) e
`occurrence-cancellation.policy.ts` (motivo obrigatório, teto de 500 — RF6).

```
$ bun --env-file=../../.env.test test ./test/trip-domain.contract.test.ts --timeout 60000
251 pass
0 fail
1112 expect() calls
Ran 251 tests across 1 file. [70.00ms]
```

## T301-T306 — Aplicação, rotas e leitura

`correct-occurrence-items.use-case.ts`, `cancel-occurrence.use-case.ts`,
`DrizzleOccurrenceCorrectionUnitOfWork` (leitura da tratativa e escrita na mesma transação),
`PATCH .../occurrences/:occurrenceId/items` e `POST .../occurrences/:occurrenceId/cancellation`
(`trip.manage`, `Idempotency-Key` via `withFieldReport`/canal `backoffice`). A leitura devolvida
por ambas as rotas publica `corrections[]`/`cancellation`.

```
$ bunx tsc --noEmit
(sem saída — 0 erros)

$ bun --env-file=../../.env.test test --timeout 120000
7065 pass
23 skip
0 fail
23985 expect() calls
Ran 7088 tests across 183 files. [~30s, repetido 3x nesta sessão]
```

Contratos ajustados pela rota nova (listas explícitas): `test/separator-role.contract.test.ts`
(o separador alcança as duas rotas, mesma permissão do registro) e
`test/rate-limited-routes.contract.test.ts` (balde `trip-occurrence-correction`, 60/300s).

## T309 — Integração contra Postgres

`test/integration/trip-occurrence-correction.integration.ts`, listado em `test:integration` do
`package.json`.

```
$ bun --env-file=../../.env.test test ./test/integration/trip-occurrence-correction.integration.ts --timeout 120000
7 pass
0 fail
14 expect() calls
Ran 7 tests across 1 file. [15.18s]
```

Cobre: CA02 (correção grava o conjunto anterior), CA03 (sem mudança real não grava e responde
200), CA06 (tratativa aberta recusa correção e cancelamento com 409), corrigir ocorrência
cancelada (409), CA08 (cancelamento grava motivo/autor/hora e a ocorrência nunca mais abre
tratativa — `hasOpenCase` trava a correção/cancelamento futuros e a cobrança da spec 164 nunca a
alcança), CA07 (cancelar duas vezes é 409).

`bun --env-file=../../.env.test run test:integration` (72 arquivos, toda a suíte) foi disparado
em background nesta sessão para confirmar zero regressão nos demais testes de integração; o
resultado não chegou a tempo de entrar nesta evidência — conferir antes de publicar.

## Lint e formatação

```
$ bun run --cwd apps/api-transportada lint
(0 erros — eslint --max-warnings=0)

$ bunx prettier --check <arquivos tocados>
(0 divergências após bunx prettier --write nos arquivos que o eslint/prettier reformatou)
```

## O que NÃO foi feito nesta sessão (fora do escopo T201-T309 executado)

- **T307 (linha do tempo, RF11/CA11)**: os dois eventos novos (correção, cancelamento) não foram
  adicionados a `TRIP_TIMELINE_KINDS`/`trip-timeline-document.query.ts`/
  `trip-timeline-merge.service.ts`. Mexer na paginação por cursor da linha do tempo (três chaves de
  desempate) sem tempo para testar a fundo era mais risco que valor nesta sessão — melhor uma task
  própria, com o `architect` revisando o cursor.
- **T308 (aviso de correção, RF14/CA13/CA14)**: `notifyOccurrence`-like para a correção não foi
  implementado. O registro (RF2-RF9) e o cancelamento (RF6-RF9) estão completos e testados sem
  isso; o aviso é efeito de borda que pode entrar depois sem tocar no que já está gravado.
- **RF9 nas leituras gerais** (`GET` de listagem/feed da ocorrência, fora da resposta das duas
  rotas de escrita): `listTripOccurrences`/`trip-occurrence-feed` ainda não publicam
  `corrections[]`/`cancellation` nem marcam a ocorrência cancelada na lista da nota (CA08 "continua
  visível marcada"). A leitura _dedicada_ (resposta do `PATCH`/`POST` desta spec) já publica os dois
  campos — falta propagar para as leituras que existiam antes desta spec.
- Como consequência do ponto acima, RF7 ("fora da listagem de ativas") não foi verificado nos
  pontos de leitura existentes — só a garantia estrutural de que uma ocorrência cancelada nunca
  mais abre tratativa (`hasOpenCase` bloqueia correção/cancelamento futuros), que é o que impede
  e-mail e cobrança de alcançá-la depois de cancelada.

Essas quatro lacunas são candidatas a uma spec/task de fechamento antes do T503 (fechamento da
Fase 5) — nenhuma delas quebra o que está implementado, mas RF9/RF11/RF14 do `spec.md` não estão
100% cobertos.
