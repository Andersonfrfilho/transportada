/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 CA07: o rollback da T1.2 desfaz só o que a 246 criou. Com a 241 no histórico, a coluna
 * `items_mode` do tipo e as duas CHECKs dela seguem de pé no catálogo do Postgres; as colunas, CHECKs
 * e FKs da 246 somem. Depois o migrador reaplica a 246, e o banco volta ao estado completo.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_requirement_modes'
const SPEC_241_CONSTRAINTS = [
  'company_occurrence_types_items_mode_check',
  'company_occurrence_types_items_off_shape_check',
] as const
const SPEC_246_CONSTRAINTS = [
  'company_occurrence_types_note_mode_check',
  'company_occurrence_types_signature_mode_check',
  'occurrence_type_contractor_overrides_note_mode_check',
  'occurrence_type_contractor_overrides_signature_mode_check',
  'occurrence_type_recipient_overrides_note_mode_check',
  'occurrence_type_recipient_overrides_signature_mode_check',
  'trip_document_occurrences_company_signature_object_fk',
  'trip_stop_occurrences_company_signature_object_fk',
] as const
const SPEC_246_COLUMNS = ['note_mode', 'signature_mode', 'signature_object_id'] as const
const ITEMS_MODE = 'items_mode'

export type OccurrenceTypeRequirementModesProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

async function readConstraintNames(database: SQL): Promise<readonly string[]> {
  const names = [...SPEC_241_CONSTRAINTS, ...SPEC_246_CONSTRAINTS]
  const rows = (await database`
    select conname from pg_constraint where conname in ${database(names)}
  `) as { conname: string }[]
  return rows.map((row) => row.conname).toSorted()
}

async function readColumns(database: SQL): Promise<readonly string[]> {
  const names = [...SPEC_246_COLUMNS, ITEMS_MODE]
  // `items_mode` das exceções é da T1c.1: só a do tipo (241) entra neste recorte.
  const rows = (await database`
    select table_name || '.' || column_name as qualified
    from information_schema.columns
    where table_schema = 'public' and column_name in ${database(names)}
      and table_name in ('company_occurrence_types', 'company_occurrence_type_contractor_overrides',
        'company_occurrence_type_recipient_overrides', 'trip_document_occurrences',
        'trip_stop_occurrences')
      and (column_name <> ${ITEMS_MODE} or table_name = 'company_occurrence_types')
  `) as { qualified: string }[]
  return rows.map((row) => row.qualified).toSorted()
}

export async function assertOccurrenceTypeRequirementModesRollback(
  probe: OccurrenceTypeRequirementModesProbe,
): Promise<void> {
  const { connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_type_requirement_modes is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  const completeConstraints = await readConstraintNames(database)
  const completeColumns = await readColumns(database)
  expect(completeConstraints).toHaveLength(
    SPEC_241_CONSTRAINTS.length + SPEC_246_CONSTRAINTS.length,
  )
  expect(completeColumns).toHaveLength(9)

  await database.unsafe(rollback)

  expect(await readConstraintNames(database)).toEqual([...SPEC_241_CONSTRAINTS].toSorted())
  expect(await readColumns(database)).toEqual([`company_occurrence_types.${ITEMS_MODE}`])

  await runDatabaseMigrations({ connectionString })
  expect(await readConstraintNames(database)).toEqual(completeConstraints)
  expect(await readColumns(database)).toEqual(completeColumns)
}
