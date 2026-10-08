# Plano — Feature 255

Padrão a seguir ponta a ponta: `declared_amount_label` (spec 247). Arquivos medidos em 07/10/2026.

## API (`apps/api-transportada`)

- `src/shared/trip-occurrence.constant.ts`: `OCCURRENCE_TYPE_ICON_NAMES` (as const) e tipo derivado.
- `src/database/trip.schema.ts` (`companyOccurrenceTypes`, ~2725): coluna `icon_name` + CHECK `company_occurrence_types_icon_name_check`.
- `drizzle/<AAAAMMDDHHMMSS>_occurrence_type_icon/` com `migration.sql`, `rollback.sql`, `snapshot.json` (padrão da 247).
- `presentation/occurrence.schema.ts:429` (`occurrenceTypeSchema`, `.strict()`): `iconName: z.enum(...).nullable().optional()`.
- `application/save-occurrence-type-values.mapper.ts` (copia campo a campo — campo esquecido é gravação perdida), `save-occurrence-type.use-case.ts`, `infrastructure/delivery-proof-read.support.ts`.
- DTO `FieldOccurrenceType` / `toFieldOccurrenceType` (`list-field-occurrence-types.use-case.ts:46,170`), `read-settings-resolution.use-case.ts:103`.
- Fixtures golden: `field-occurrence-type.fixture.ts`, `driver-snapshot-document.golden.json`, `settings-resolution.golden.json`.

## Painel (`apps/frontend-transportada`)

- `occurrenceType.types.ts`, `trip.types.ts`, `tripResponse.validation.ts` (guard de chave exata: chave opcional primeiro), `occurrenceTypeUpdate.service.ts`, `tripClient.service.ts:~980`.
- Seletor novo `OccurrenceTypeIconPicker.component.tsx` em `OccurrenceTypeRecordFields`; locale pt-BR.
- `TripOccurrences.component.tsx`: ícone ao lado de `occurrence.typeName` (a ocorrência precisa trazer `typeIconName` — conferir se o `GET` da viagem já devolve o tipo; senão, campo aditivo na leitura).
- `src/components/ui/icon.tsx`: glyphs do catálogo ausentes (`money`, `package`, `invoice`… conferir).

## Motorista (`apps/frontend-driver`)

- `driverTrip.types.ts:436` (`DriverOccurrenceType`) e guard `isDriverOccurrenceType:490` (campo opcional, desconhecido tolerado).
- `DriverOccurrenceRegistrationForm.component.tsx:~120`: `<Icon>` no chip; `icon.tsx`: glyphs faltantes (`truck`, `clock`…), mesmo traçado do painel.
- `scripts/driver-preview-api.ts:81` e golden do snapshot.

## Ordem de publicação (ADR-0081 §9)

1. painel e app tolerantes → 2) API (migration + leitura + gravação) → 3) telas.

## Riscos

- Guard de chave exata do painel rejeita a chave nova se a API publicar antes (por isso a etapa 1).
- Duas cópias do catálogo de glyphs (painel/motorista): contrato que compara os nomes do catálogo da API com `ICON_PATHS` das duas apps.
