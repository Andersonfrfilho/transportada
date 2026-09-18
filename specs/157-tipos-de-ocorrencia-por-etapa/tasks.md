# Tasks

| Fase | Tasks | Modelo   |
| ---- | ----- | -------- |
| 1    | T1–T3 | `sonnet` |

## Fase 1 — Tipos por etapa

> 🤖 Modelo: `sonnet`

- [x] T1 Rota `GET /me/trips/current/occurrence-types` — `me-trip.routes.ts`, `main.ts` —
      contrato em `test/driver-trip/me-routes.contract.ts` (CA1, CA2)
- [x] T2 PWA do motorista consome a rota nova — `driverTripClient.service.ts`,
      `driverTrip.types.ts` — contrato do cliente (CA4)
- [x] T3 Guarda de etapa no galpão — `register-trip-occurrence.use-case.ts`, `trip.error.ts` —
      contrato em `test/trip-occurrence/register.contract.ts` (CA3)
