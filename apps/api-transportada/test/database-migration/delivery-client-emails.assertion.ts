/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T1 (CA1, lado do banco): a tabela genérica `delivery_client_emails` recusa tipo fora do vocabulário,
 * endereço fora da forma, duplicata no mesmo tipo sem distinguir caixa e cliente de outra empresa; aceita o mesmo
 * endereço em outro tipo. O rollback recusa com e-mail guardado e, vazio, tira a tabela; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  UNIQUE_VIOLATION,
} from './business-calendar-constraints.assertion.js'
import { rollbackDeliveryClientContacts } from './delivery-client-contacts.assertion.js'
import { expectQueryToFail, migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_delivery_client_emails'
const CLIENT_TAX_ID = '12345678000195'
const UNKNOWN_TAX_ID = '98765432000198'

export type DeliveryClientEmailsProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

type EmailValues = {
  readonly address?: string
  readonly createdByKind?: string
  readonly label?: string
  readonly purpose?: string
  readonly taxId?: string
}

async function runRollback(database: SQL, rollback: string): Promise<Error | undefined> {
  const reserved = await database.reserve()
  try {
    await reserved.unsafe(rollback)
    return undefined
  } catch (error) {
    await reserved.unsafe('ROLLBACK')
    return error as Error
  } finally {
    reserved.release()
  }
}

async function readRollback(directories: readonly string[]): Promise<null | string> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return null
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

async function tableExists(database: SQL): Promise<boolean> {
  const [row] = (await database`
    select to_regclass('public.delivery_client_emails') is not null as present
  `) as readonly { readonly present: boolean }[]
  return row?.present ?? false
}

export async function assertDeliveryClientEmails(probe: DeliveryClientEmailsProbe): Promise<void> {
  const { companyId, connectionString, database, directories, userId } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) {
    throw new Error('delivery_client_emails is required')
  }
  /** Spec 281 T3b renomeia esta tabela: volta à forma da 279 antes de provar a T1; o reapply do fim devolve as duas. */
  await rollbackDeliveryClientContacts(database, directories)
  expect(await tableExists(database)).toBe(true)

  await database`
    insert into delivery_clients (company_id, tax_id, display_name)
    values (${companyId}, ${CLIENT_TAX_ID}, 'Prova 279 T1')
    on conflict (company_id, tax_id) do nothing
  `
  const insertEmail = (values: EmailValues = {}) => database`
    insert into delivery_client_emails (company_id, tax_id, purpose, address, label, created_by_kind, created_by_user_id)
    values (${companyId}, ${values.taxId ?? CLIENT_TAX_ID}, ${values.purpose ?? 'boleto'},
      ${values.address ?? 'financeiro@mercado.com.br'}, ${values.label ?? ''},
      ${values.createdByKind ?? 'office'}, ${userId})
  `

  await insertEmail({ label: 'financeiro' })
  /** Mesmo endereço, outro tipo: vale. */
  await insertEmail({ purpose: 'invoice' })
  await insertEmail({ address: 'dono@mercado.com.br', createdByKind: 'driver' })

  await expectQueryToFail(
    insertEmail({ address: 'FINANCEIRO@Mercado.com.br' }),
    UNIQUE_VIOLATION,
    'delivery_client_emails_client_purpose_address_unique',
  )
  await expectQueryToFail(
    insertEmail({ purpose: 'cobranca' }),
    CHECK_VIOLATION,
    'delivery_client_emails_purpose_check',
  )
  for (const address of [
    'sem-arroba',
    'a@b',
    'com espaco@mercado.com',
    `${'a'.repeat(250)}@b.com`,
  ]) {
    await expectQueryToFail(
      insertEmail({ address }),
      CHECK_VIOLATION,
      'delivery_client_emails_address_check',
    )
  }
  await expectQueryToFail(
    insertEmail({ address: 'rotulo@mercado.com.br', label: 'x'.repeat(61) }),
    CHECK_VIOLATION,
    'delivery_client_emails_label_check',
  )
  await expectQueryToFail(
    insertEmail({ address: 'sistema@mercado.com.br', createdByKind: 'system' }),
    CHECK_VIOLATION,
    'delivery_client_emails_created_by_kind_check',
  )
  /** Cliente que não é desta empresa: a FK composta com o tenant recusa. */
  await expectQueryToFail(
    insertEmail({ taxId: UNKNOWN_TAX_ID }),
    FOREIGN_KEY_VIOLATION,
    'delivery_client_emails_client_fk',
  )

  const refusal = await runRollback(database, rollback)
  expect(refusal?.message).toContain('rollback recusado')
  expect(await tableExists(database)).toBe(true)

  await database`delete from delivery_client_emails where company_id = ${companyId}`
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await tableExists(database)).toBe(false)
  expect(await readMigrationNames(database)).not.toContain(directory)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await tableExists(database)).toBe(true)
}
