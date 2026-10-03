# Evidência — Spec 244

## T1 — `pendingProofs` vazio sem `trip.report` (D2)

- Regra no caso de uso: `findCurrentDriverTrip` recebe `canReportProofs` (ausente = `true`, preserva os outros chamadores);
  com `false` o repositório de pendências nem é consultado. A rota `GET /me/trips/current` calcula o booleano de
  `context.scope.permissions.has('trip.report')`.
- Contrato vermelho antes do código (3 falhas), verde depois: `test/driver-trip/current-trip.contract.ts` (caso de uso) e
  `test/driver-trip/me-routes.contract.ts` (ajudante → `false`, motorista → `true`).
- Integração em Postgres 18 nativo descartável: `test/integration/me-trip.integration.ts` — quem entregou como motorista e
  só tem `trip.read` recebe `[]`; com `trip.report` recebe a fila; viagens iguais nos dois casos.
- Mutação: `shouldListPendingProofs = true` e `canReportProofs: true` fixos → 2 falhas no contrato e 1 na integração;
  restaurado, `cmp` idêntico.
- Contrato completo da API: 9299 pass / 0 fail. Integrações me-trip, me-trip-departure e
  current-driver-trip-concluded-window: 37 pass / 0 fail / 0 skip.
