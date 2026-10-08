# Evidência — Feature 255

Worktree: `../transportada-wt/spec-255` (branch `work/spec-255`, a partir de `origin/staging` @ 754630a65).

## T0.1 — Conferência do `plan.md` contra `origin/staging` (2026-10-07)

Existem como escrito: `src/shared/trip-occurrence.constant.ts`, `src/database/trip.schema.ts`
(`company_occurrence_types` na linha 2726; `declared_amount_label` coluna 2854, CHECK 2946),
`src/trips/presentation/occurrence.schema.ts`, `save-occurrence-type-values.mapper.ts`,
`list-field-occurrence-types.use-case.ts`, `read-settings-resolution.use-case.ts`,
`infrastructure/delivery-proof-read.support.ts`, os dois `icon.tsx`, `scripts/driver-preview-api.ts`,
`field-occurrence-type.fixture.ts`.

Divergências (o plano deve ser lido com estas correções):

| Plano diz                                                           | Real                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-transportada/.../occurrenceType.types.ts`                 | `src/modules/trip/shared/occurrenceType.types.ts`                                                                                                                                         |
| `.../tripResponse.validation.ts`, `occurrenceTypeUpdate.service.ts` | também em `src/modules/trip/shared/`                                                                                                                                                      |
| `frontend-driver/.../driverTrip.types.ts`                           | `src/modules/driver-trip/shared/driverTrip.types.ts`                                                                                                                                      |
| `DriverOccurrenceRegistrationForm`                                  | `src/modules/driver-trip/components/`                                                                                                                                                     |
| só `frontend-driver` tem tipo de motorista                          | **`frontend-transportada/src/modules/driver-trip/shared/driverTrip.types.ts` também existe** (caminho de transição `/minha-viagem`, ADR-0075): T1.2 e T3.3 precisam tocar nas duas cópias |
| goldens `driver-snapshot-document.golden.json`                      | existe em **três** apps (api, frontend-driver, frontend-transportada); `settings-resolution.golden.json` em api e frontend-transportada                                                   |

Última migration: `20261007205304_nfse_national_taxation` (a nova tem de ser posterior).
