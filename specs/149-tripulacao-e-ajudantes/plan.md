# Spec 149 — Plano

## Banco (migrations aditivas, com `snapshot.json`)

| Tabela                                    | Mudança                                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fleet_drivers`                           | `can_act_as_helper boolean not null default false`, `helper_daily_rate numeric(19,4)` (check `>= 0`)                                                                                        |
| `company_crew_settings` (nova)            | `company_id` PK/FK, `helper_daily_rate numeric(19,4)`, `created_at`, `updated_at`                                                                                                           |
| `trip_drivers`                            | `role varchar not null default 'driver'` + check `in ('driver','helper')`                                                                                                                   |
| `route_suggestion_vehicles`               | `driver_source varchar` (`link`/`recommended`/`manual`, nulo sem motorista)                                                                                                                 |
| `route_suggestion_vehicle_helpers` (nova) | `company_id`, `suggestion_id`, `vehicle_id`, `driver_id`; unique `(company_id, suggestion_id, driver_id)`                                                                                   |
| `driver_assignment_feedback` (nova)       | `id` uuid, `company_id`, `suggestion_id`, `vehicle_id`, `recommended_driver_id` nulo, `chosen_driver_id` nulo, `actor_user_id`, `created_at`; índice `(company_id, vehicle_id, created_at)` |

Sem ENUM nativo, dinheiro em `numeric`. Toda tabela nova com `company_id` nas FKs compostas, no mesmo
padrão de `trip_drivers`.

## API

- `fleet/`: schema de request e mapper da ficha com os dois campos novos; `PUT /company-crew-settings`
  e `GET` (`fleet.manage` / `fleet.read`).
- `trips/`: `resolveTripCrewForCreation` aceita `{driverId, role}`; `create-trip-mdfe-manifest.use-case.ts`
  filtra `role = driver`; `trip-driver-cost.policy.ts` continua lendo só motoristas.
- `trips/domain/trip-helper-cost.policy.ts` (nova, pura): D7. Entra em `TRIP_COST_KINDS` e no seam único
  `buildValuationFromContext` — viagem, prévia e sugestão pelo mesmo caminho.
- `fleet/infrastructure/driver-performance.query.ts` + `fleet/domain/driver-performance.policy.ts`: uma
  consulta agregada por componente (CTE por motorista, janela de 90 dias, filtro de tenant), policy pura
  com pesos, renormalização e "sem histórico".
- `routing/domain/driver-recommendation.policy.ts` (pura): ordenação `score + afinidade`, desempate por
  id; `routing/application/multi-vehicle-suggestion.use-case.ts` preenche `recommended` na criação.
- `PATCH /route-suggestions/:id/vehicles/:vehicleId/crew` (`trip.manage`): só com sugestão `ready`; 409 em
  pessoa repetida (RF-2 da ADR-0055 estendido a ajudantes) e em ajudante sem `can_act_as_helper`; grava
  feedback quando o motorista muda.
- `trip-composer.adapter.ts`: `createTrip` recebe `crew: {driverId, role}[]`.

## Frontend

- `fleet`: campos na ficha; painel "Diária do ajudante" na aba de motoristas (registro em
  `SETTINGS_PANEL_PLACEMENT`).
- `trip`: `useTripRouteAssembly` passa a mandar os pares do estado (`selectVehicles`/`assignDriver`), não
  `resolveSoleDriverOfVehicle` direto (D12). Revisão da proposta com select de motorista por veículo
  (opções ordenadas pelo score, com o motivo) e `multi-select` de ajudantes; resumo das linhas sem motorista.
- Conta: linha "Ajudantes" na valuation (verde/vermelho pelos tokens existentes).

## Testes (lista explícita no `package.json` de cada app)

- API contrato: crew role, MDF-e só condutor, parcela `helper` (critérios 4 e 5), policy de score,
  policy de recomendação, PATCH crew (409s, feedback), tenant-safety das tabelas novas.
- API integração (`--env-file=../../.env.test`): consulta de desempenho contra Postgres.
- Migration: `make migration-test`.
- Front: pares da montagem, select com score, ajudantes, painel de diária.

## Riscos

- Consulta de desempenho em base grande: medir com `EXPLAIN` na integração; índices novos só se medidos.
- Score com pouco dado em staging: o "sem histórico" (D8) evita ranking falso.
