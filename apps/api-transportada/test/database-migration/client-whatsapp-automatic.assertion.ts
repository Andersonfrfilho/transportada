/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3: a migration acrescenta a trava `claimed_at` na entrega do retorno e os motivos `client_without_whatsapp`
 * e `template_missing` nas CHECKs da entrega e do evento. O rollback tira os três e recusa com motivo novo gravado
 * (conferido pelo texto). É a mais nova: roda antes de qualquer outro rollback desta suíte.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_client_whatsapp_automatic'

export type ClientWhatsAppAutomaticProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readShape(database: SQL): Promise<{
  readonly hasClaimedAt: boolean
  readonly reasons: readonly boolean[]
}> {
  const [column] = (await database`
    select 1 as found from information_schema.columns
     where table_name = 'occurrence_contractor_reply_deliveries' and column_name = 'claimed_at'
  `) as readonly unknown[]
  const checks = (await database`
    select pg_get_constraintdef(oid) as definition from pg_constraint
     where conname in ('occurrence_contractor_reply_deliveries_reason_check',
                       'occurrence_contractor_reply_events_reason_check')
     order by conname
  `) as readonly { readonly definition: string }[]
  return {
    hasClaimedAt: column !== undefined,
    reasons: checks.map(
      (check) =>
        check.definition.includes("'client_without_whatsapp'") &&
        check.definition.includes("'template_missing'"),
    ),
  }
}

export async function assertClientWhatsAppAutomatic(
  probe: ClientWhatsAppAutomaticProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('client_whatsapp_automatic is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(rollback).toContain('rollback recusado')
  expect(await readShape(database)).toEqual({ hasClaimedAt: true, reasons: [true, true] })

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readShape(database)).toEqual({ hasClaimedAt: false, reasons: [false, false] })

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readShape(database)).toEqual({ hasClaimedAt: true, reasons: [true, true] })
}

/** Para a 248 derrubar as tabelas do retorno: esta mexe na entrega e no evento, sai antes de todas. */
export async function rollbackClientWhatsAppAutomatic(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  await database.unsafe(
    await Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text(),
  )
}
