/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory } from './support.js'

const CANHOTO_READ_MIGRATION_SUFFIX = '_trip_canhoto_read_job'
const LATER_JOB_MIGRATION_SUFFIX = '_cargo_preview_retention'
const JOB_NAME = 'trip.canhoto.read'
const INDEX_NAME = 'trip_delivery_proofs_canhoto_pending_idx'
const INDEX_DEFINITION = `CREATE INDEX ${INDEX_NAME} ON public.trip_delivery_proofs USING btree (created_at) WHERE (((canhoto_review)::text = 'pending'::text) AND (canhoto_read_source IS NULL) AND (canhoto_read_attempted_at IS NULL))`

export type CanhotoReadQueueProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

type QueueState = Readonly<{
  attemptedAtColumn: { readonly dataType: string; readonly isNullable: string } | undefined
  checksAcceptTheJob: readonly boolean[]
  indexDefinition: string | null
  scheduleIntervals: readonly number[]
}>

/**
 * A fila do robô de canhoto vive de um índice parcial que o planejador só usa se os `quals` da
 * consulta repetirem os literais do predicado. O teste prova o plano, o carimbo anulável sem
 * backfill, a linha do relógio e as duas CHECK — e que o rollback desfaz tudo e a migration volta.
 */
export async function assertCanhotoReadQueue(probe: CanhotoReadQueueProbe): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(CANHOTO_READ_MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('Canhoto read queue migration is required')

  expectAppliedState(await readQueueState(database))
  const plan = await readQueuePlan(database)
  expect(plan).toContain(`Index Scan using ${INDEX_NAME}`)

  // Ordem inversa: a migration que depois ampliou as mesmas CHECK de `job` sai antes, ou a CHECK antiga
  // recusaria a linha do relógio da rotina nova.
  const laterDirectory = probe.directories.find((name) => name.endsWith(LATER_JOB_MIGRATION_SUFFIX))
  if (laterDirectory !== undefined) {
    await database.unsafe(
      await Bun.file(join(migrationsDirectory.pathname, laterDirectory, 'rollback.sql')).text(),
    )
  }
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
  expect(await readQueueState(database)).toEqual({
    attemptedAtColumn: undefined,
    checksAcceptTheJob: [false, false],
    indexDefinition: null,
    scheduleIntervals: [],
  })
  const journal = await database<Array<{ readonly name: string }>>`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `
  expect(journal).toEqual([])

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expectAppliedState(await readQueueState(database))
}

function expectAppliedState(state: QueueState): void {
  expect(state.attemptedAtColumn).toEqual({
    dataType: 'timestamp with time zone',
    isNullable: 'YES',
  })
  expect(state.indexDefinition).toBe(INDEX_DEFINITION)
  expect(state.scheduleIntervals).toEqual([300])
  expect(state.checksAcceptTheJob).toEqual([true, true])
}

async function readQueueState(database: SQL): Promise<QueueState> {
  const [column] = await database<
    Array<{ readonly data_type: string; readonly is_nullable: string }>
  >`
    select data_type, is_nullable from information_schema.columns
    where table_name = 'trip_delivery_proofs' and column_name = 'canhoto_read_attempted_at'
  `
  const [index] = await database<Array<{ readonly indexdef: string }>>`
    select indexdef from pg_indexes where indexname = ${INDEX_NAME}
  `
  const schedules = await database<Array<{ readonly interval_seconds: number }>>`
    select interval_seconds from job_schedules where job = ${JOB_NAME}
  `
  const checks = await database<Array<{ readonly conname: string; readonly definition: string }>>`
    select conname, pg_get_constraintdef(oid) as definition from pg_constraint
    where conname in ('job_executions_job_check', 'job_schedules_job_check')
    order by conname
  `
  return {
    attemptedAtColumn:
      column === undefined
        ? undefined
        : { dataType: column.data_type, isNullable: column.is_nullable },
    checksAcceptTheJob: checks.map((check) => check.definition.includes(`'${JOB_NAME}'`)),
    indexDefinition: index?.indexdef ?? null,
    scheduleIntervals: schedules.map((schedule) => schedule.interval_seconds),
  }
}

/** Tabela vazia faz o planejador preferir varredura sequencial; desligá-la mostra o que o índice serve. */
async function readQueuePlan(database: SQL): Promise<string> {
  return database.begin(async (transaction) => {
    await transaction`set local enable_seqscan = off`
    const rows = await transaction<Array<{ readonly 'QUERY PLAN': string }>>`
      explain
      select id from trip_delivery_proofs
      where canhoto_review = 'pending'
        and canhoto_read_source is null
        and canhoto_read_attempted_at is null
      order by created_at
      limit 20
    `
    return rows.map((row) => row['QUERY PLAN']).join('\n')
  })
}
