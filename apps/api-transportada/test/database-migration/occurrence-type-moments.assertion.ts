/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.1: o rollback da tabela de momentos derruba só ela — `stage` e `flow` do tipo seguem
 * de pé, porque são a rede do rollback — e o migrador a reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_moments'
const MOMENTS_TABLE = 'company_occurrence_type_moments'
const KEPT_TYPE_COLUMNS = ['flow', 'stage'] as const

export type OccurrenceTypeMomentsProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

async function readMomentsTableCount(database: SQL): Promise<number> {
  const [row] = (await database`
    select count(*)::int as total from information_schema.tables
    where table_schema = 'public' and table_name = ${MOMENTS_TABLE}
  `) as { total: number }[]
  return row?.total ?? 0
}

async function readKeptTypeColumns(database: SQL): Promise<readonly string[]> {
  const rows = (await database`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'company_occurrence_types'
      and column_name in ${database([...KEPT_TYPE_COLUMNS])}
  `) as { column_name: string }[]
  return rows.map((row) => row.column_name).toSorted()
}

export async function assertOccurrenceTypeMomentsRollback(
  probe: OccurrenceTypeMomentsProbe,
): Promise<void> {
  const { connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_type_moments is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  expect(await readMomentsTableCount(database)).toBe(1)
  await database.unsafe(rollback)
  expect(await readMomentsTableCount(database)).toBe(0)
  expect(await readKeptTypeColumns(database)).toEqual([...KEPT_TYPE_COLUMNS])

  await runDatabaseMigrations({ connectionString })
  expect(await readMomentsTableCount(database)).toBe(1)
}
