/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T3b (RF9): a migration acrescenta `client_email_type` ao tipo da ocorrência. O padrão é `off` e nenhuma
 * linha antiga muda (a migration não liga botão em tipo existente). A CHECK aceita só `off` e os tipos de e-mail do
 * cliente; o rollback tira a coluna e a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_client_email_type'

export type OccurrenceTypeClientEmailTypeProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readType(database: SQL, typeId: string): Promise<string | undefined> {
  const [row] = (await database`
    select client_email_type as email_type from company_occurrence_types where id = ${typeId}
  `) as readonly { readonly email_type: string }[]
  return row?.email_type
}

async function hasColumn(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
     where table_name = 'company_occurrence_types' and column_name = 'client_email_type'
  `) as readonly unknown[]
  return rows.length === 1
}

export async function assertOccurrenceTypeClientEmailType(
  probe: OccurrenceTypeClientEmailTypeProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_type_client_email_type is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(await hasColumn(database)).toBe(true)

  await database.unsafe(rollback)
  expect(await hasColumn(database)).toBe(false)
  expect(await readMigrationNames(database)).not.toContain(directory)

  const existing = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, emails_contractor, contractor_reply_mode, driver_reply_template)
    values (${existing}, ${companyId}, ${`Prova 279 T3b antigo ${existing}`}, 'delivery', true, 'forward_after_approval',
            'Segue o boleto atualizado.')
  `
  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readType(database, existing)).toBe('off')

  const fresh = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage)
    values (${fresh}, ${companyId}, ${`Prova 279 T3b novo ${fresh}`}, 'delivery')
  `
  expect(await readType(database, fresh)).toBe('off')
  await database`update company_occurrence_types set client_email_type = 'boleto' where id = ${fresh}`
  expect(await readType(database, fresh)).toBe('boleto')
  expect(
    await database`
      update company_occurrence_types set client_email_type = 'newsletter' where id = ${fresh}
    `.catch((error: Error) => error.message),
  ).toContain('company_occurrence_types_client_email_type_check')

  await database`delete from company_occurrence_types where id in (${existing}, ${fresh})`
}
