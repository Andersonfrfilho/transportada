/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1c.1: o rollback desfaz só o que a migration dos mínimos criou. Com a 241 no histórico,
 * a coluna `items_mode` do tipo e as duas CHECKs dela seguem de pé no catálogo do Postgres; as
 * colunas e CHECKs dos mínimos somem. Depois o migrador reaplica, e o banco volta ao estado completo.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_quantity_minimums'
const TYPES = 'company_occurrence_types'
const CONTRACTOR = 'company_occurrence_type_contractor_overrides'
const RECIPIENT = 'company_occurrence_type_recipient_overrides'
const SPEC_241_CONSTRAINTS = [
  'company_occurrence_types_items_mode_check',
  'company_occurrence_types_items_off_shape_check',
] as const
const MINIMUM_CHECK_SUFFIXES = [
  'items_minimum_count_check',
  'items_minimum_shape_check',
  'photo_minimum_count_check',
] as const
const SPEC_246_CONSTRAINTS = [
  ...MINIMUM_CHECK_SUFFIXES.map((suffix) => `${TYPES}_${suffix}`),
  ...['contractor', 'recipient'].flatMap((kind) =>
    [...MINIMUM_CHECK_SUFFIXES, 'items_mode_check'].map(
      (suffix) => `occurrence_type_${kind}_overrides_${suffix}`,
    ),
  ),
]
const MINIMUM_COLUMNS = ['photo_minimum_count', 'items_minimum_count'] as const
const ITEMS_MODE = 'items_mode'

export type OccurrenceTypeQuantityMinimumsProbe = Readonly<{
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
  const names = [...MINIMUM_COLUMNS, ITEMS_MODE]
  const rows = (await database`
    select table_name || '.' || column_name as qualified
    from information_schema.columns
    where table_schema = 'public' and column_name in ${database(names)}
      and table_name in (${TYPES}, ${CONTRACTOR}, ${RECIPIENT})
  `) as { qualified: string }[]
  return rows.map((row) => row.qualified).toSorted()
}

export async function assertOccurrenceTypeQuantityMinimumsRollback(
  probe: OccurrenceTypeQuantityMinimumsProbe,
): Promise<void> {
  const { connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_type_quantity_minimums is required')
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
  expect(await readColumns(database)).toEqual([`${TYPES}.${ITEMS_MODE}`])

  await runDatabaseMigrations({ connectionString })
  expect(await readConstraintNames(database)).toEqual(completeConstraints)
  expect(await readColumns(database)).toEqual(completeColumns)
}
