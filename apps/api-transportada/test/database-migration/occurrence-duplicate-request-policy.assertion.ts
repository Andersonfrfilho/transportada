/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T4: a migration acrescenta a trava de pedido repetido ao tipo. O padrão da coluna é `allow` (fica como
 * hoje); o tipo que já pedia algo à contratante passa a bloquear (`while_request_open`). A CHECK recusa valor fora da lista; o rollback tira a coluna e a migration
 * reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_duplicate_request_policy'

export type OccurrenceDuplicateRequestPolicyProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readPolicy(database: SQL, typeId: string): Promise<string | undefined> {
  const [row] = (await database`
    select duplicate_request_policy as policy from company_occurrence_types where id = ${typeId}
  `) as readonly { readonly policy: string }[]
  return row?.policy
}

async function hasColumn(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
     where table_name = 'company_occurrence_types' and column_name = 'duplicate_request_policy'
  `) as readonly unknown[]
  return rows.length === 1
}

export async function assertOccurrenceDuplicateRequestPolicy(
  probe: OccurrenceDuplicateRequestPolicyProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_duplicate_request_policy is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(await hasColumn(database)).toBe(true)

  await database.unsafe(rollback)
  expect(await hasColumn(database)).toBe(false)
  expect(await readMigrationNames(database)).not.toContain(directory)

  const withoutReply = crypto.randomUUID()
  const withReply = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, emails_contractor, contractor_reply_mode, driver_reply_template)
    values
      (${withoutReply}, ${companyId}, ${`Prova 276 T4 sem retorno ${withoutReply}`}, 'delivery', false, 'off', ''),
      (${withReply}, ${companyId}, ${`Prova 276 T4 com retorno ${withReply}`}, 'delivery', true, 'forward_after_approval',
       'Segue o boleto atualizado.')
  `
  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readPolicy(database, withoutReply)).toBe('allow')
  expect(await readPolicy(database, withReply)).toBe('while_request_open')

  const fresh = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage)
    values (${fresh}, ${companyId}, ${`Prova 276 T4 novo ${fresh}`}, 'delivery')
  `
  expect(await readPolicy(database, fresh)).toBe('allow')
  expect(
    await database`
      update company_occurrence_types set duplicate_request_policy = 'never' where id = ${fresh}
    `.catch((error: Error) => error.message),
  ).toContain('company_occurrence_types_duplicate_request_policy_check')

  await database`delete from company_occurrence_types where id in (${withoutReply}, ${withReply}, ${fresh})`
}
