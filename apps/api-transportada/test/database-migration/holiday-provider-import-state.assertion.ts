/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.1: o retrato do que a migration da importação de feriados deixa no banco — tabelas, colunas,
 * nomes de constraint e de índice (lidos de `pg_constraint`/`pg_indexes`, onde o Postgres trunca calado
 * o que passa de 63 bytes) e a rotina. Aplicada e desfeita têm cada uma o seu retrato.
 */
import type { SQL } from 'bun'

import {
  ALL_NEW_CONSTRAINT_NAMES,
  ALL_NEW_INDEX_NAMES,
  JOB,
  JOB_CHECKS,
  NEW_TABLES,
  PUBLISHED_TABLE_CONSTRAINTS,
  PUBLISHED_TABLE_INDEXES,
} from './holiday-provider-import.constant.js'

export type ImportState = {
  readonly columns: readonly string[]
  readonly constraints: readonly string[]
  readonly indexes: readonly string[]
  readonly jobChecksAcceptTheJob: readonly boolean[]
  readonly schedules: ReadonlyArray<{
    readonly enabled: boolean
    readonly hasPausedAt: boolean
    readonly intervalSeconds: number
    readonly pausedBy: string | null
    readonly pausedOrigin: string | null
  }>
  readonly tables: readonly string[]
}

export const APPLIED_STATE: ImportState = {
  columns: ['municipal_holidays.provider_entry_id', 'state_holidays.provider_entry_id'],
  constraints: ALL_NEW_CONSTRAINT_NAMES.toSorted(),
  indexes: ALL_NEW_INDEX_NAMES.toSorted(),
  jobChecksAcceptTheJob: [true, true],
  schedules: [
    {
      enabled: false,
      hasPausedAt: true,
      intervalSeconds: 86_400,
      pausedBy: null,
      pausedOrigin: 'system',
    },
  ],
  tables: [...NEW_TABLES].toSorted(),
}

export const ROLLED_BACK_STATE: ImportState = {
  columns: [],
  constraints: [],
  indexes: [],
  jobChecksAcceptTheJob: [false, false],
  schedules: [],
  tables: [],
}

const names = (rows: ReadonlyArray<{ readonly name: string }>): readonly string[] =>
  rows.map((row) => row.name).toSorted()

export async function readImportState(database: SQL): Promise<ImportState> {
  const tables = await database<Array<{ readonly name: string }>>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_name in ${database(NEW_TABLES)}
  `
  const columns = await database<Array<{ readonly name: string }>>`
    select table_name || '.' || column_name as name from information_schema.columns
    where table_schema = 'public' and column_name = 'provider_entry_id'
      and table_name in ('municipal_holidays', 'state_holidays')
  `
  const constraints = await database<Array<{ readonly name: string }>>`
    select conname as name from pg_constraint
    where contype in ('p', 'u', 'f', 'c')
      and (conrelid::regclass::text in ${database(NEW_TABLES)}
        or conname in ${database(PUBLISHED_TABLE_CONSTRAINTS)})
  `
  const indexes = await database<Array<{ readonly name: string }>>`
    select indexname as name from pg_indexes
    where schemaname = 'public'
      and (tablename in ${database(NEW_TABLES)} or indexname in ${database(PUBLISHED_TABLE_INDEXES)})
  `
  const jobChecks = await database<Array<{ readonly accepts: boolean }>>`
    select pg_get_constraintdef(oid) like ${`%'${JOB}'%`} as accepts from pg_constraint
    where conname in ${database(JOB_CHECKS.map(([, constraint]) => constraint))}
    order by conname
  `
  const schedules = await database<
    Array<{
      readonly enabled: boolean
      readonly has_paused_at: boolean
      readonly interval_seconds: number
      readonly paused_by: string | null
      readonly paused_origin: string | null
    }>
  >`
    select enabled, (paused_at is not null) as has_paused_at, interval_seconds, paused_by, paused_origin
    from job_schedules where job = ${JOB}
  `

  return {
    columns: names(columns),
    constraints: names(constraints),
    indexes: names(indexes),
    jobChecksAcceptTheJob: jobChecks.map((row) => row.accepts),
    schedules: schedules.map((row) => ({
      enabled: row.enabled,
      hasPausedAt: row.has_paused_at,
      intervalSeconds: row.interval_seconds,
      pausedBy: row.paused_by,
      pausedOrigin: row.paused_origin,
    })),
    tables: names(tables),
  }
}
