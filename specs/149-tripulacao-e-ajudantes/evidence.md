# Spec 149 — Evidências

## Diagnóstico (14/09/2026)

- Staging: proposta com 7 motoristas e 6 veículos, 5 viagens "Sem motorista".
- Causa: `useTripRouteAssembly.hook.ts:223-230` usa `resolveSoleDriverOfVehicle` (vínculo único do
  cadastro); a escolha manual por veículo não é enviada; `trip-composer.adapter.ts:64-80` cria 0 ou 1
  motorista por viagem.

## Tarefas

(uma seção por task: comando, saída resumida, commit)

## T1 — migrations

Migration `apps/api-transportada/drizzle/20260915022856_trip_crew_helpers/` (gerada por
`bun run db:generate --name trip_crew_helpers`; nome já maior que `20260915005629_…`, sem renomear;
`snapshot.json` com `prevIds` = snapshot da `20260915005629`). Aditiva: 3 `CREATE TABLE`, 4
`ADD COLUMN` (os `NOT NULL` com default), unique novo em `route_suggestion_vehicles` antes da FK dos
ajudantes, checks por último; sem `CREATE TYPE`, nada destrutivo. `rollback.sql` à mão.

- Contrato vermelho antes: `bun test ./test/fleet-schema.contract.test.ts ./test/trip-schema.contract.test.ts ./test/routing-schema.contract.test.ts`
  → 0 pass / 3 fail (módulos inexistentes). Depois da implementação: 217 pass / 0 fail.
- `bun run typecheck` (raiz) → exit 0.
- `bun run db:check` → "Everything's fine".
- `bun test` de `database-migration`, `fleet-schema`, `trip-schema`, `routing-schema`, `fleet-domain`
  → 366 pass / 4 skip / 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000` (API) → 5803 pass / 23 skip / 0 fail.
- `make migration-test` (Postgres descartável, migration + rollback) → 95 pass / 0 fail. Inclui
  `trip-constraints.assertion.ts`: linha legada sem `role` vira `driver`; ajudante na posição 1 →
  23514 `trip_drivers_lead_role_check`; `role` inválido → 23514 `trip_drivers_role_check`.
- `bun run format:check` e `bun run lint` → exit 0.

Decisões:

- `driver_assignment_feedback` tem unique `(company_id, suggestion_id, vehicle_id)`: upsert, a
  última escolha vence (por isso `updated_at`).
- Despacho do MDF-e só leva `role = driver`; ajudante pode registrar comprovante e ver o DAMDFE
  (implementado em T3/T4).
- O teto `MAX_DRIVERS_PER_TRIP = 10` vale para a tripulação inteira (motoristas + ajudantes).
