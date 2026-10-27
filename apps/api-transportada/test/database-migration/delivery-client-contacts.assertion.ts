/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T3b (D11/D12, lado do banco): a `delivery_client_emails` da 279 vira `delivery_client_contacts` com o canal
 * (`email` | `whatsapp`) e a ocorrência de origem; o tipo de ocorrência ganha `client_channel`. Nenhuma linha antiga
 * muda de sentido (o e-mail guardado vira `email`, o tipo vira `email`). A visão `delivery_client_emails` deixa a API e
 * o worker antigos lerem e gravarem e-mail durante o deploy, sem enxergar o WhatsApp. O rollback recusa com WhatsApp
 * guardado e, sem ele, devolve a tabela da 279; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { CHECK_VIOLATION, UNIQUE_VIOLATION } from './business-calendar-constraints.assertion.js'
import { expectQueryToFail, migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_delivery_client_contacts'
const CLIENT_TAX_ID = '12345678000196'

export type DeliveryClientContactsProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

type ContactValues = {
  readonly address?: string
  readonly channel?: string
  readonly sourceOccurrenceId?: null | string
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

async function readRollback(directories: readonly string[]): Promise<string> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('delivery_client_contacts is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

async function relationKind(database: SQL, name: string): Promise<null | string> {
  const [row] = (await database`
    select relkind::text as kind from pg_class
     where relnamespace = 'public'::regnamespace and relname = ${name}
  `) as readonly { readonly kind: string }[]
  return row?.kind ?? null
}

async function hasClientChannel(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
     where table_name = 'company_occurrence_types' and column_name = 'client_channel'
  `) as readonly unknown[]
  return rows.length === 1
}

/**
 * Para quem testa uma migration anterior que toca a mesma tabela (279 T1): tira esta antes, enquanto não houver
 * WhatsApp guardado. O `runDatabaseMigrations` do fim de quem chamou reaplica.
 */
export async function rollbackDeliveryClientContacts(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  if ((await relationKind(database, 'delivery_client_contacts')) === null) return
  await database.unsafe(await readRollback(directories))
}

export async function assertDeliveryClientContacts(
  probe: DeliveryClientContactsProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories, userId } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined) throw new Error('delivery_client_contacts is required')
  expect(await relationKind(database, 'delivery_client_contacts')).toBe('r')
  expect(await relationKind(database, 'delivery_client_emails')).toBe('v')

  /** Antes da migration: o e-mail e o tipo como a 279 os deixou. */
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await relationKind(database, 'delivery_client_emails')).toBe('r')
  expect(await relationKind(database, 'delivery_client_contacts')).toBeNull()
  expect(await hasClientChannel(database)).toBe(false)

  await database`
    insert into delivery_clients (company_id, tax_id, display_name)
    values (${companyId}, ${CLIENT_TAX_ID}, 'Prova 281 T3b')
    on conflict (company_id, tax_id) do nothing
  `
  const [legacy] = (await database`
    insert into delivery_client_emails (company_id, tax_id, purpose, address, created_by_kind, created_by_user_id)
    values (${companyId}, ${CLIENT_TAX_ID}, 'boleto', 'financeiro@mercado.com.br', 'office', ${userId})
    returning id
  `) as readonly { readonly id: string }[]
  const existingType = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, client_email_type)
    values (${existingType}, ${companyId}, ${`Prova 281 T3b antigo ${existingType}`}, 'delivery', 'boleto')
  `

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await relationKind(database, 'delivery_client_contacts')).toBe('r')
  expect(await relationKind(database, 'delivery_client_emails')).toBe('v')

  /** Nada antigo muda de sentido: o e-mail é `email`, sem ocorrência de origem; o tipo fala por e-mail. */
  const [migrated] = (await database`
    select channel, source_occurrence_id from delivery_client_contacts where id = ${legacy?.id ?? ''}
  `) as readonly { readonly channel: string; readonly source_occurrence_id: null | string }[]
  expect(migrated).toEqual({ channel: 'email', source_occurrence_id: null })
  const [typeRow] = (await database`
    select client_channel from company_occurrence_types where id = ${existingType}
  `) as readonly { readonly client_channel: string }[]
  expect(typeRow?.client_channel).toBe('email')

  const insertContact = (values: ContactValues = {}) => database`
    insert into delivery_client_contacts
      (company_id, tax_id, purpose, channel, address, created_by_kind, created_by_user_id, source_occurrence_id)
    values (${companyId}, ${CLIENT_TAX_ID}, 'boleto', ${values.channel ?? 'whatsapp'},
      ${values.address ?? '+5511987654321'}, 'driver', ${userId}, ${values.sourceOccurrenceId ?? null})
  `
  const occurrenceId = crypto.randomUUID()
  await insertContact({ sourceOccurrenceId: occurrenceId })
  await expectQueryToFail(
    insertContact(),
    UNIQUE_VIOLATION,
    'delivery_client_contacts_client_purpose_address_unique',
  )
  for (const address of [
    '11987654321',
    '+0511987654321',
    '+55 11 98765-4321',
    '+55119',
    'a@b.com',
  ]) {
    await expectQueryToFail(
      insertContact({ address }),
      CHECK_VIOLATION,
      'delivery_client_contacts_address_check',
    )
  }
  /** O canal decide a forma: número no canal `email` não passa. */
  await expectQueryToFail(
    insertContact({ address: '+5511912345678', channel: 'email' }),
    CHECK_VIOLATION,
    'delivery_client_contacts_address_check',
  )
  /** Canal fora do vocabulário também cai na forma do endereço (que só conhece os dois), por isso a prova é no `UPDATE`. */
  await expectQueryToFail(
    database`update delivery_client_contacts set channel = 'sms' where company_id = ${companyId} and channel = 'whatsapp'`,
    CHECK_VIOLATION,
  )
  expect(
    await database`
      select 1 from pg_constraint where conname = 'delivery_client_contacts_channel_check'
    `.then((rows: readonly unknown[]) => rows.length),
  ).toBe(1)

  /** A visão da 279 grava e-mail sem saber do canal e nunca mostra o WhatsApp. */
  await database`
    insert into delivery_client_emails (company_id, tax_id, purpose, address, created_by_kind, created_by_user_id)
    values (${companyId}, ${CLIENT_TAX_ID}, 'boleto', 'dono@mercado.com.br', 'driver', ${userId})
  `
  const throughView = (await database`
    select address from delivery_client_emails where company_id = ${companyId} and tax_id = ${CLIENT_TAX_ID}
     order by address
  `) as readonly { readonly address: string }[]
  expect(throughView.map((row) => row.address)).toEqual([
    'dono@mercado.com.br',
    'financeiro@mercado.com.br',
  ])
  const [viewInsert] = (await database`
    select channel from delivery_client_contacts where address = 'dono@mercado.com.br' and company_id = ${companyId}
  `) as readonly { readonly channel: string }[]
  expect(viewInsert?.channel).toBe('email')
  await database`
    update delivery_client_emails set label = 'dono' where company_id = ${companyId} and address = 'dono@mercado.com.br'
  `
  await database`
    delete from delivery_client_emails where company_id = ${companyId} and address = 'dono@mercado.com.br'
  `

  const freshType = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage)
    values (${freshType}, ${companyId}, ${`Prova 281 T3b novo ${freshType}`}, 'delivery')
  `
  await database`update company_occurrence_types set client_channel = 'whatsapp' where id = ${freshType}`
  expect(
    await database`
      update company_occurrence_types set client_channel = 'sms' where id = ${freshType}
    `.catch((error: Error) => error.message),
  ).toContain('company_occurrence_types_client_channel_check')

  /** Com WhatsApp guardado o rollback recusa; sem ele, volta à tabela da 279 com o e-mail intacto. */
  const refusal = await runRollback(database, rollback)
  expect(refusal?.message).toContain('rollback recusado')
  expect(await relationKind(database, 'delivery_client_contacts')).toBe('r')

  await database`delete from delivery_client_contacts where company_id = ${companyId} and channel = 'whatsapp'`
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await relationKind(database, 'delivery_client_emails')).toBe('r')
  expect(await hasClientChannel(database)).toBe(false)
  const [kept] = (await database`
    select address from delivery_client_emails where id = ${legacy?.id ?? ''}
  `) as readonly { readonly address: string }[]
  expect(kept?.address).toBe('financeiro@mercado.com.br')

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await relationKind(database, 'delivery_client_contacts')).toBe('r')

  await database`delete from delivery_client_contacts where company_id = ${companyId} and tax_id = ${CLIENT_TAX_ID}`
  await database`delete from company_occurrence_types where id in (${existingType}, ${freshType})`
}
