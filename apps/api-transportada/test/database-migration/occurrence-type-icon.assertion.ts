/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * The rollback of the occurrence type icon drops only its CHECK and column; the other CHECKs of
 * `company_occurrence_types` stay. A type stored before the migration is reapplied comes back with
 * `icon_name` NULL — no data is rewritten.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_icon'

export const OCCURRENCE_TYPE_ICON_CONSTRAINT = 'company_occurrence_types_icon_name_check'

const SURVIVING_CONSTRAINTS = [
  'company_occurrence_types_declared_amount_items_check',
  'company_occurrence_types_items_mode_check',
  'company_occurrence_types_stage_check',
] as const

export type OccurrenceTypeIconProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

async function readConstraintNames(database: SQL, names: readonly string[]): Promise<string[]> {
  const rows = (await database`
    select conname from pg_constraint where conname in ${database(names)}
  `) as { conname: string }[]
  return rows.map((row) => row.conname).toSorted()
}

async function hasIconColumn(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_occurrence_types'
      and column_name = 'icon_name'
  `) as unknown[]
  return rows.length === 1
}

export async function assertOccurrenceTypeIconRollback(
  probe: OccurrenceTypeIconProbe,
): Promise<void> {
  const { companyId, connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_type_icon is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  expect(await readConstraintNames(database, [OCCURRENCE_TYPE_ICON_CONSTRAINT])).toEqual([
    OCCURRENCE_TYPE_ICON_CONSTRAINT,
  ])
  expect(await hasIconColumn(database)).toBe(true)

  await database.unsafe(rollback)

  expect(await readConstraintNames(database, [OCCURRENCE_TYPE_ICON_CONSTRAINT])).toEqual([])
  expect(await hasIconColumn(database)).toBe(false)
  expect(await readConstraintNames(database, SURVIVING_CONSTRAINTS)).toEqual(
    [...SURVIVING_CONSTRAINTS].toSorted(),
  )

  const seededId = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, redelivery_policy)
    values (${seededId}, ${companyId}, ${`Icon probe ${seededId}`}, 'delivery', 'unset')
  `
  await runDatabaseMigrations({ connectionString })

  const stored = (await database`
    select icon_name from company_occurrence_types where id = ${seededId}
  `) as { icon_name: null | string }[]
  expect(stored).toEqual([{ icon_name: null }])
  expect(await readConstraintNames(database, [OCCURRENCE_TYPE_ICON_CONSTRAINT])).toEqual([
    OCCURRENCE_TYPE_ICON_CONSTRAINT,
  ])

  await database`delete from company_occurrence_types where id = ${seededId}`
}
