# Tasks

> 🤖 Modelo: `sonnet` (T001 e T004 são 🧠 — migration e reversão de ADR)

- [x] T001 (⚠️ migration-test pendente de Docker) 🧠 Coluna `driver_id` em `route_suggestion_vehicles` — `src/database/route-suggestion.schema.ts`,
      `drizzle/<nova>/migration.sql` + `rollback.sql`, cópia em
      `worker-transportada/src/database/routing.schema.ts` — `make migration-test`
- [x] T002 [P] Contrato do vínculo por empresa — `test/fleet-http/driver-vehicle-links.contract.ts`
      e isolamento em `test/fleet-schema/tenant-safety.contract.ts` — contrato vermelho antes da rota
- [x] T003 [P] `GET /fleet/driver-vehicles` — `fleet/presentation/fleet.routes.ts`,
      `fleet/application/fleet-driver-vehicles.use-case.ts`,
      `fleet/infrastructure/drizzle-fleet-driver-vehicle.repository.ts` — T002 verde
- [x] T004 🧠 Contratos do par na sugestão — `test/routing-http/multi-vehicle-suggestion.contract.ts`,
      `test/routing-application/multi-vehicle-suggestion.contract.ts` — vermelhos antes de T005
- [x] T005 🧠 Par na API — `routing/presentation/route-suggestion-request.schema.ts`,
      `routing/application/multi-vehicle-suggestion.{port,use-case,repository}.ts`,
      `routing/infrastructure/{drizzle-multi-vehicle-suggestion.repository,trip-composer.adapter}.ts`,
      `routing/domain/routing.error.ts` — T004 verde
- [x] T006 [P] Contrato do pareamento no frontend — `test/routing/multi-vehicle-pairing.contract.ts` —
      vermelho antes de T007
- [x] T007 Pareamento e diálogo — `routing/shared/multiVehiclePairing.service.ts`,
      `routing/shared/routeSuggestionClient.service.ts`,
      `routing/hooks/useMultiVehicleSuggestion.hook.ts`,
      `routing/components/MultiVehicleSuggestion{Dialog,Action}.component.tsx`,
      `routing/locales/routing*.locale.json`, `routing/styles/routing.module.css` — T006 verde
- [x] T008 Gate — `bun run typecheck`, `bun run lint`, testes das três apps tocadas — `evidence.md`
