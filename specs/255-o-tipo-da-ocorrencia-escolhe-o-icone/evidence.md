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

## T0.2 — O `GET` da viagem devolve o tipo? (2026-10-07)

Devolve **só o nome**. `infrastructure/delivery-proof-read.support.ts:416` e `:919` fazem `innerJoin` com
`company_occurrence_types` e selecionam `typeName: companyOccurrenceTypes.name`; o painel lê `typeName`
em `trip.types.ts:208` e `:390` (e `trip.constant.ts:458`, chaves exatas da referência da linha do tempo).
Não há `typeIconName`. Consequência para o RF6: o join já existe, então o campo é aditivo
(`typeIconName: companyOccurrenceTypes.iconName` nos dois selects, T2.2) e o painel o lê como opcional (T1.1).
Atenção: `trip.constant.ts:458` e `:637` são listas de chaves exatas — conferir se `typeIconName` precisa entrar.

## T1.1 — Painel tolerante (2026-10-07)

**Vermelho inicial:**

- Contrato `occurrence-type-icon-tolerance.contract.ts` criado: 5 testes falhando (5 fail, 7614 pass)
  - `iconName` não aceito em tipo (chave desconhecida)
  - `typeIconName` não aceito em ocorrência
  - Função `tripOccurrenceFromApi` inexistente

**Implementação:**

1. `occurrenceType.types.ts:41-42`: `iconName?: null | string`
2. `trip.types.ts:208-209`: `typeIconName?: null | string` em `TripOccurrence`
3. `trip.types.ts:226-227`: `iconName?: null | string` em `FieldOccurrenceType`
4. `tripResponse.validation.ts:1924`: `iconName` em allowed keys
5. `tripResponse.validation.ts:1960`: validação `(value.iconName === undefined || value.iconName === null || isString(value.iconName))`
6. `tripResponse.validation.ts:2021`: desestruturação de `iconName` em `toOccurrenceType`
7. `tripResponse.validation.ts:2042`: spread condicional `...(isString(iconName) ? { iconName } : {})`
8. `trip.constant.ts:502-503`: `typeIconName` em `TRIP_OCCURRENCE_OPTIONAL_KEYS`
9. `tripResponse.validation.ts:1509-1512`: validação de `typeIconName` em `isTripOccurrence`
10. `tripResponse.validation.ts:1118-1120`: função `tripOccurrenceFromApi(input: unknown): TripOccurrence`
11. `test/trip.contract.test.ts:159`: import `occurrence-type-icon-tolerance.contract`
12. Prettier: formatação do arquivo novo

**Verde final:**

- Testes: 7619 pass, 0 fail ✓
- Typecheck: sem erros ✓
- ESLint: sem erros ✓
- Prettier: passou ✓

**Commit:** `cd5253999` — feat(frontend): painel aceita iconName opcional no tipo de ocorrência (spec 255 T1.1)
