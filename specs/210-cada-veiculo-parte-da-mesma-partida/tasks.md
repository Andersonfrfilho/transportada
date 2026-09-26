# Tasks

> 🤖 Modelo: `sonnet` — fix pontual, um arquivo de produção, escopo fechado pela spec.

- [x] T001 Escrever o contrato que prova o defeito — `test/routing/route-optimization-effect.contract.ts`
      (novo `test`: 2 veículos, `solve` de teste fixando as atribuições, `assert` de que a primeira
      parada do 2º veículo chega em `departureEpochSeconds + trecho`). Rodado contra o código antes
      do fix: falhou (480s recebido, 120s esperado) — evidência em `evidence.md`.
- [x] T002 Mover `let clockSeconds = input.context.departureEpochSeconds` para dentro do laço
      `for (const assignment of input.solution.assignments)` em
      `src/routing/application/route-optimization.effect.ts` (`toOrderedStops`), junto de
      `previousIndex`. Comentário `⚠️` explicando por que o relógio é por veículo.
- [x] T003 Gates: `bun run --cwd apps/worker-transportada typecheck`,
      `bun run --cwd apps/worker-transportada lint`,
      `bun --env-file=../../.env.test test --timeout 120000` (de dentro de
      `apps/worker-transportada`), `bun --env-file=../../.env.test run test:integration` (idem).
      Evidência em `evidence.md`.
- [x] T004 Registrar o achado das pausas de jornada (`sinceBreakSeconds`, `route-fitness.policy.ts`)
      como divergência fora do escopo desta spec, em `evidence.md` e no corpo da `spec.md`.
