/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T3: a migration alarga as CHECKs da entrega do retorno para o alvo `client_boleto_emails` (alvo e endereço).
 * O rollback volta as duas CHECKs e sai do diário; a migration reaplica. A recusa com entrega gravada nesse alvo vive no
 * próprio `rollback.sql` (conferida aqui pelo texto), e a linha real do alvo, em `occurrence-contractor-reply-rows`.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_contractor_reply_client_boleto_emails'
const TARGET = 'client_boleto_emails'
const CONSTRAINTS = [
  'occurrence_contractor_reply_deliveries_address_check',
  'occurrence_contractor_reply_deliveries_target_check',
] as const

export type ContractorReplyClientBoletoEmailsProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readRollback(directories: readonly string[]): Promise<null | string> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return null
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

/** As CHECKs que aceitam o alvo, em ordem. */
async function readWidenedConstraints(database: SQL): Promise<readonly string[]> {
  const rows = (await database`
    select conname, pg_get_constraintdef(oid) as definition from pg_constraint
     where conname in ${database([...CONSTRAINTS])}
     order by conname
  `) as readonly { readonly conname: string; readonly definition: string }[]
  return rows.filter((row) => row.definition.includes(TARGET)).map((row) => row.conname)
}

export async function assertContractorReplyClientBoletoEmails(
  probe: ContractorReplyClientBoletoEmailsProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) {
    throw new Error('contractor_reply_client_boleto_emails is required')
  }
  expect(rollback).toContain(`WHERE "target" = '${TARGET}'`)
  expect(rollback).toContain('rollback recusado')
  expect(await readWidenedConstraints(database)).toEqual([...CONSTRAINTS])

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readWidenedConstraints(database)).toEqual([])

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readWidenedConstraints(database)).toEqual([...CONSTRAINTS])
}

/** O rollback da 248 apaga a tabela da entrega, cujas CHECKs esta migration alarga: desfaz-se primeiro a mais nova. */
export async function rollbackContractorReplyClientBoletoEmails(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  await database.unsafe(rollback)
}
