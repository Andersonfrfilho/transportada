# Evidência — 210 Cada veículo parte da mesma partida

## T001 — contrato falha antes do fix

Teste novo: `'a primeira parada do 2º veículo parte da partida, não do relógio do 1º veículo'`
(`test/routing/route-optimization-effect.contract.ts`).

Reproduzido revertendo só `src/routing/application/route-optimization.effect.ts` para o `HEAD`
(via cópia local, sem tocar em outra sessão) e rodando `bun test ./test/routing.contract.test.ts`:

```
error: expect(received).toBe(expected)
Expected: 120
Received: 480
(fail) route optimization effect (ADR-0044 §7) > a primeira parada do 2º veículo parte da partida, não do relógio do 1º veículo
92 pass / 1 fail
```

480 = 60 (trecho depósito→parada 1) + 300 (`serviceTimeSeconds` da parada 1) + 120 (trecho
depósito→parada 2) — exatamente a herança do relógio do 1º veículo. 120 é o valor correto: só o
trecho depósito→parada 2.

## T002/T003 — depois do fix

```
$ bun run --cwd apps/worker-transportada typecheck
$ bunx tsc --noEmit
(sem saída — 0 erros)

$ bun run --cwd apps/worker-transportada lint
$ bunx eslint src test scripts eslint.config.js --max-warnings=0
(sem saída — 0 erros/avisos)

$ bun test ./test/routing.contract.test.ts
93 pass / 0 fail / 168 expect() calls

$ bun --env-file=../../.env.test test --timeout 120000   (de apps/worker-transportada)
1547 pass / 4 skip / 0 fail / 4259 expect() calls — 117 arquivos

$ bun --env-file=../../.env.test run test:integration   (de apps/worker-transportada)
130 pass / 4 skip / 0 fail / 592 expect() calls — 30 arquivos, inclui
route-optimization-pool.integration.test.ts, route-optimization-trip-weight.integration.test.ts e
geocoded-route-optimization.integration.test.ts (os três que tocam o código mudado)
```

`make worker-integration` foi tentado além dos dois comandos acima e **falhou por motivo alheio a
esta mudança**: a migration `trip_occurrence_cases_redelivery_application_decision_check` (spec 179)
tenta um `ALTER TABLE ... CHECK` sobre a coluna `redelivery_application` antes de ela existir no
banco provisionado pelo `db:migrate` do target — erro de ordenação de migration, não relacionado a
`route-optimization.effect.ts` nem a `route-fitness.policy.ts`. Os dois comandos de teste do worker
já exercitam o Postgres compartilhado (`.env.test`) com sucesso, inclusive os três arquivos de
integração do roteamento — considerado suficiente para este fix pontual. Ordenação de migration da
179 fica fora do escopo desta spec.

## Achado fora do escopo — pausas de jornada não entram no ETA publicado

`route-fitness.policy.ts:67,81-88,239-252` (`evaluateRoute`/`insertBreakIfDue`) soma
`mandatoryBreakSeconds` a `durationSeconds` quando `sinceBreakSeconds >= breakEverySeconds` — mas só
quando `problem.duty` não é nulo (`RouteDutyLimits.breakEverySeconds` e `.mandatoryBreakSeconds`
ambos não-nulos). `toOrderedStops` (`route-optimization.effect.ts`) não tem equivalente: o relógio
publicado soma trecho + espera de janela + serviço, nunca pausa obrigatória.

Não é o mesmo defeito desta spec (que é o relógio não resetar entre veículos) — é uma segunda
divergência entre o custo que o fitness minimiza e o ETA que chega a `trip_stops` e ao portal do
contratante, condicionada a `duty` estar configurado (hoje não é o caso da maior parte das
instalações, conforme comentário em `route-solver.types.ts:38-39`). Registrado aqui para virar spec
própria quando alguma instalação configurar `duty` com pausa obrigatória — corrigi-lo junto desta
spec ampliaria o escopo do P0 original.
