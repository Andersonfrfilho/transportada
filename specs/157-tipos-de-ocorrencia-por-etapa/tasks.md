# Tasks

| Fase | Tasks | Modelo   |
| ---- | ----- | -------- |
| 1    | T1–T3 | `sonnet` |
| 2    | T4    | `sonnet` |

## Fase 1 — Tipos por etapa

> 🤖 Modelo: `sonnet`

- [x] T1 Rota `GET /me/trips/current/occurrence-types` — `me-trip.routes.ts`, `main.ts` —
      contrato em `test/driver-trip/me-routes.contract.ts` (CA1, CA2)
- [x] T2 PWA do motorista consome a rota nova — `driverTripClient.service.ts`,
      `driverTrip.types.ts` — contrato do cliente (CA4)
- [x] T3 Guarda de etapa no galpão — `register-trip-occurrence.use-case.ts`, `trip.error.ts` —
      contrato em `test/trip-occurrence/register.contract.ts` (CA3)

## Fase 2 — O motorista sabe quando a lista falhou

> 🤖 Modelo: `sonnet`

- [x] T4 Aviso quando a lista de tipos falha (RF5, CA5) — `driverTripClient.service.ts`
      (`listOccurrenceTypes` devolve estado `loaded | failed`, sem engolir o erro),
      `DriverTripWorkspace.page.tsx` (sai o `.catch(() => undefined)`; recarregar sob demanda),
      `DriverStopCard.component.tsx` (painel: aviso de falha + "Tentar de novo", texto de lista
      vazia), `driverTrip.locale.json` (textos novos) — contratos em
      `test/driver-trip/occurrence.contract.ts` antes do código; smoke 500→200 em
      `responsive.smoke.spec.ts`; print mobile dos dois estados em `prints/` e revisão de design e
      usabilidade no `evidence.md`.
  - Critério de pronto: falha **não** bloqueia entregar/devolver/"Deu problema"; nada de PII no
    aviso; `make check` verde; commit isolado.
