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

## T2 — ficha do motorista e diária geral

Arquivos:

- `src/fleet/presentation/fleet-request.schema.ts`: `driverFieldsSchema` ganha `canActAsHelper`
  (`z.boolean().default(false)`) e `helperDailyRate` (`z.string().regex(MONEY_DECIMAL).nullable()`
  — mesma regex de dinheiro `numeric(19,4)` já usada nos campos do veículo; negativo não casa a
  forma e vira `400 INVALID_REQUEST` na fronteira, antes de tocar o CHECK do banco).
- `src/fleet/application/fleet.port.ts` (`FleetDriverInput`), `src/fleet/infrastructure/fleet.mapper.ts`
  (`mapDriver`/`toDriverColumns`) e `src/fleet/presentation/fleet.routes.ts` (`serializeDriver`): os
  dois campos entram e saem da ficha (criação, atualização e leitura — GET da ficha e da lista).
- Módulo novo `company-crew-settings` (diária geral, D2), dentro de `src/fleet/` (permissão é
  `fleet.read`/`fleet.manage`, não `settings.manage`, então não segue o módulo `companies/`):
  `application/crew-settings.port.ts`, `application/crew-settings.use-case.ts` (get/set, molde de
  `cargo-settings.use-case.ts`), `infrastructure/drizzle-crew-settings.repository.ts` (upsert por
  `onConflictDoUpdate`, mesmo padrão de `DrizzleCargoSettingsRepository`), `presentation/crew-settings.schema.ts`
  (mesma regex de dinheiro, `.nullable()` para aceitar `{ helperDailyRate: null }` e limpar o
  parâmetro), `presentation/crew-settings.routes.ts` (`GET`/`PUT /company-crew-settings`,
  `API_COMPANY_CREW_SETTINGS_PATH` novo em `shared/api.constant.ts`). GET sem linha devolve
  `{ data: { helperDailyRate: null } }`, nunca 404. `companyId` sempre de `context.scope.companyId`.
  Registrado em `src/main.ts` ao lado de `createFleetRoutes`/`createCargoSettingsRoutes`.
- `test/separator-role.contract.test.ts`: `createCompanyCrewSettingsRoutes` entra no array de rotas
  do contrato; `GET /company-crew-settings` foi adicionado à lista alcançável do separador (ele tem
  `fleet.read`); `PUT /company-crew-settings` foi adicionado à lista de rotas recusadas (ele não tem
  `fleet.manage`).
- `test/fleet-http/crew-settings.contract.ts` (novo, registrado em `test/fleet-http.contract.test.ts`):
  permissão de cada rota, GET sem linha → `null`, PUT idempotente + GET reflete, PUT limpa de volta
  para `null`, negativo e formato sem 4 casas → 400 sem tocar o repositório, isolamento entre
  empresas (linha de uma empresa nunca aparece nem é sobrescrita pela outra).
- `test/fleet-http/drivers.contract.ts`: dois testes novos — os campos vão e voltam em
  criação/atualização, e valor negativo/malformado de `helperDailyRate` reprova com o campo nomeado
  em `details`.
- Fixtures/seeds ajustados para o campo novo (obrigatório em `FleetDriverInput`):
  `test/fixtures/fleet-http-payload.fixture.ts`, `test/fleet-domain/driver-home-manual-coordinate.contract.ts`,
  `test/fleet-domain/person-name.contract.ts`, `src/database/local-fleet-seed.constant.ts`.

Comandos e saída:

- Contrato vermelho antes: os arquivos de teste novos/editados não existiam com os campos novos;
  rodar `bun run typecheck` sem as mudanças de mapper/port falhava com `TS2739` (`FleetDriverInput`
  sem `canActAsHelper`/`helperDailyRate`) nos fixtures — confirma que o tipo pegou a lacuna antes de
  qualquer teste HTTP rodar.
- `bun run typecheck` (raiz, 6 apps) → exit 0.
- `bun test ./test/fleet-http.contract.test.ts ./test/fleet-application.contract.test.ts ./test/separator-role.contract.test.ts ./test/fleet-schema.contract.test.ts ./test/trip-schema.contract.test.ts ./test/routing-schema.contract.test.ts ./test/fleet-domain.contract.test.ts ./test/fleet-infrastructure.contract.test.ts`
  → 560 pass / 0 fail.
- `bun run test` (lista completa do `package.json`) → 5812 pass / 23 skip / 0 fail (era 5803 pass na
  T1; a diferença são os testes novos desta task).
- `bun --env-file=../../.env.test test --timeout 120000` (API, de dentro de `apps/api-transportada`)
  → 5812 pass / 23 skip / 0 fail — mesma contagem, confirma que nada regrediu sob o `.env.test`.
- `bun run lint` e `bun run format:check` (raiz, 6 apps) → exit 0.
- `make check` (raiz) → exit 0 (build de todas as apps + testes + lint + format, sem erro).
- `make migration-test` → 95 pass / 0 fail (Postgres descartável).

Decisões:

- `company_crew_settings` ganhou módulo próprio dentro de `fleet/` (não em `companies/`, onde mora
  `company-cargo-settings`): a permissão pedida (`fleet.read`/`fleet.manage`) é da frota, não
  `settings.manage`, e o `plan.md` já apontava o parâmetro para dentro de `fleet/`.
- Sem rota `DELETE` para a diária geral (diferente de `cargo-settings`, que tem uma): a spec só pede
  `GET`/`PUT`, e `PUT` com `helperDailyRate: null` já limpa o valor de forma idempotente — reduzir a
  superfície evita uma rota sem pedido no RF-2.
- Não adicionei regra cruzada "helperDailyRate exige canActAsHelper": a spec (D1/D2) não pede essa
  amarração, e o RF-1 só descreve os dois campos como independentes na ficha.
