/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T3c (RF10): a migration acrescenta `client_email_send_mode` ao tipo da ocorrência e o motivo
 * `client_without_email` às entregas e ao histórico do retorno. O padrão é `manual` e nenhuma linha antiga muda (a
 * migration não liga o envio automático em tipo existente). A CHECK aceita só `manual` e `automatic`; o rollback tira a
 * coluna e estreita os motivos, e recusa com linha gravada com o motivo novo; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_client_email_send_mode'
const REASON = 'client_without_email'
const REASON_CONSTRAINTS = [
  'occurrence_contractor_reply_deliveries_reason_check',
  'occurrence_contractor_reply_events_reason_check',
] as const

export type ClientEmailSendModeProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readRollback(directories: readonly string[]): Promise<null | string> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return null
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

async function readMode(database: SQL, typeId: string): Promise<string | undefined> {
  const [row] = (await database`
    select client_email_send_mode as send_mode from company_occurrence_types where id = ${typeId}
  `) as readonly { readonly send_mode: string }[]
  return row?.send_mode
}

async function hasColumn(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
     where table_name = 'company_occurrence_types' and column_name = 'client_email_send_mode'
  `) as readonly unknown[]
  return rows.length === 1
}

/** As CHECKs de motivo que aceitam o motivo novo, em ordem. */
async function readWidenedReasons(database: SQL): Promise<readonly string[]> {
  const rows = (await database`
    select conname, pg_get_constraintdef(oid) as definition from pg_constraint
     where conname in ${database([...REASON_CONSTRAINTS])}
     order by conname
  `) as readonly { readonly conname: string; readonly definition: string }[]
  return rows.filter((row) => row.definition.includes(REASON)).map((row) => row.conname)
}

export async function assertClientEmailSendMode(probe: ClientEmailSendModeProbe): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) {
    throw new Error('client_email_send_mode is required')
  }
  expect(rollback).toContain(`WHERE "reason" = '${REASON}'`)
  expect(rollback).toContain('rollback recusado')
  expect(await hasColumn(database)).toBe(true)
  expect(await readWidenedReasons(database)).toEqual([...REASON_CONSTRAINTS])

  await database.unsafe(rollback)
  expect(await hasColumn(database)).toBe(false)
  expect(await readWidenedReasons(database)).toEqual([])
  expect(await readMigrationNames(database)).not.toContain(directory)

  const existing = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, client_email_type)
    values (${existing}, ${companyId}, ${`Prova 279 T3c antigo ${existing}`}, 'delivery', 'boleto')
  `
  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readWidenedReasons(database)).toEqual([...REASON_CONSTRAINTS])
  expect(await readMode(database, existing)).toBe('manual')

  const fresh = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage)
    values (${fresh}, ${companyId}, ${`Prova 279 T3c novo ${fresh}`}, 'delivery')
  `
  expect(await readMode(database, fresh)).toBe('manual')
  await database`update company_occurrence_types set client_email_send_mode = 'automatic' where id = ${fresh}`
  expect(await readMode(database, fresh)).toBe('automatic')
  expect(
    await database`
      update company_occurrence_types set client_email_send_mode = 'sometimes' where id = ${fresh}
    `.catch((error: Error) => error.message),
  ).toContain('company_occurrence_types_client_email_send_mode_check')

  await database`delete from company_occurrence_types where id in (${existing}, ${fresh})`
}

/** Os rollbacks antigos recriam as CHECKs de motivo e a tabela da entrega: desfaz-se primeiro a mais nova. */
export async function rollbackClientEmailSendMode(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  await database.unsafe(rollback)
}
