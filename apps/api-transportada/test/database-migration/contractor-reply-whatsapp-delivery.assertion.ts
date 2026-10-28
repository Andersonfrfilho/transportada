/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5: a migration acrescenta à entrega do retorno o alvo `client_boleto_whatsapp`, os motivos do WhatsApp e a
 * coluna `provider_message_id`. O rollback volta as CHECKs, tira a coluna e sai do diário; a migration reaplica. A
 * recusa com entrega por WhatsApp gravada vive no próprio `rollback.sql` (conferida aqui pelo texto).
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_contractor_reply_whatsapp_delivery'
const TARGET = 'client_boleto_whatsapp'
const TABLE = 'occurrence_contractor_reply_deliveries'
const PROVIDER_MESSAGE_CHECK = 'occurrence_contractor_reply_deliveries_provider_message_check'

export type ContractorReplyWhatsAppDeliveryProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readRollback(directories: readonly string[]): Promise<null | string> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return null
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

/** O que a migration põe: a coluna, a CHECK do id do provedor e o alvo na CHECK de alvo. */
async function readWhatsAppShape(database: SQL): Promise<{
  readonly column: boolean
  readonly providerMessageCheck: boolean
  readonly target: boolean
}> {
  const [column] = (await database`
    select count(*)::int as count from information_schema.columns
     where table_name = ${TABLE} and column_name = 'provider_message_id'
  `) as readonly { readonly count: number }[]
  const constraints = (await database`
    select conname, pg_get_constraintdef(oid) as definition from pg_constraint
     where conname in ${database([PROVIDER_MESSAGE_CHECK, `${TABLE}_target_check`])}
  `) as readonly { readonly conname: string; readonly definition: string }[]
  return {
    column: (column?.count ?? 0) === 1,
    providerMessageCheck: constraints.some((row) => row.conname === PROVIDER_MESSAGE_CHECK),
    target: constraints.some(
      (row) => row.conname === `${TABLE}_target_check` && row.definition.includes(TARGET),
    ),
  }
}

export async function assertContractorReplyWhatsAppDelivery(
  probe: ContractorReplyWhatsAppDeliveryProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) {
    throw new Error('contractor_reply_whatsapp_delivery is required')
  }
  expect(rollback).toContain(`WHERE "target" = '${TARGET}'`)
  expect(rollback).toContain('rollback recusado')
  expect(await readWhatsAppShape(database)).toEqual({
    column: true,
    providerMessageCheck: true,
    target: true,
  })

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readWhatsAppShape(database)).toEqual({
    column: false,
    providerMessageCheck: false,
    target: false,
  })

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readWhatsAppShape(database)).toEqual({
    column: true,
    providerMessageCheck: true,
    target: true,
  })
}

/** O rollback da 248 apaga a tabela e o da 279 T3 recria as CHECKs que esta alarga: desfaz-se primeiro a mais nova. */
export async function rollbackContractorReplyWhatsAppDelivery(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  await database.unsafe(rollback)
}
