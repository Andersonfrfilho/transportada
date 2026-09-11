/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import {
  databaseSchema,
  userWhatsAppPhones,
  whatsAppPhoneVerificationRequests,
} from '../../src/database/database.schema.js'
import {
  userWhatsAppPhones as directPhones,
  whatsAppPhoneVerificationRequests as directRequests,
} from '../../src/database/user-whatsapp-phone.schema.js'

type Table = Parameters<typeof getTableConfig>[0]

const dialect = new PgDialect()

const columnNames = (table: Table): readonly string[] =>
  getTableConfig(table).columns.map((column) => column.name)

const checkSql = (table: Table, name: string): string | undefined => {
  const constraint = getTableConfig(table)
    .checks.filter((candidate) => candidate.name === name)
    .at(0)

  return constraint === undefined ? undefined : dialect.sqlToQuery(constraint.value).sql
}

const uniqueNames = (table: Table): readonly string[] =>
  getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.name)
    .filter((name): name is string => name !== undefined)

const findIndex = (table: Table, name: string) =>
  getTableConfig(table)
    .indexes.filter((index) => index.config.name === name)
    .at(0)

const indexWhere = (table: Table, name: string): string | undefined => {
  const where = findIndex(table, name)?.config.where
  return where === undefined ? undefined : dialect.sqlToQuery(where).sql
}

const foreignKeyNames = (table: Table): readonly string[] =>
  getTableConfig(table).foreignKeys.map((key) => key.getName())

describe('whatsapp phone binding schema', () => {
  test('keeps the database schema aggregator compatible with both tables', () => {
    expect(userWhatsAppPhones).toBe(directPhones)
    expect(whatsAppPhoneVerificationRequests).toBe(directRequests)
    expect(databaseSchema).toMatchObject({
      userWhatsAppPhones: directPhones,
      whatsAppPhoneVerificationRequests: directRequests,
    })
  })

  test('names the binding and the verification request tables', () => {
    expect(
      [userWhatsAppPhones, whatsAppPhoneVerificationRequests].map(
        (table) => getTableConfig(table).name,
      ),
    ).toEqual(['user_whatsapp_phones', 'whatsapp_phone_verification_requests'])
  })

  test('binds one phone to a user, with the verification instant and no company', () => {
    expect(columnNames(userWhatsAppPhones)).toEqual([
      'id',
      'user_id',
      'phone',
      'verified_at',
      'created_at',
      'updated_at',
    ])
    expect(columnNames(userWhatsAppPhones)).not.toContain('company_id')
  })

  test('cascades the binding with the user, and keeps one binding per user', () => {
    expect(foreignKeyNames(userWhatsAppPhones)).toEqual([
      'user_whatsapp_phones_user_id_identity_users_id_fk',
    ])
    const [userForeignKey] = getTableConfig(userWhatsAppPhones).foreignKeys
    expect(userForeignKey?.onDelete).toBe('cascade')
    expect(uniqueNames(userWhatsAppPhones)).toEqual(['user_whatsapp_phones_user_id_unique'])
  })

  test('accepts only the canonical phone, the same pattern the policy produces', () => {
    expect(checkSql(userWhatsAppPhones, 'user_whatsapp_phones_phone_check')).toContain(
      '^55[1-9][0-9]{9,10}$',
    )
  })

  test('makes a verified phone unique in the whole installation, and a pending one not', () => {
    const name = 'user_whatsapp_phones_phone_verified_unique'
    expect(findIndex(userWhatsAppPhones, name)?.config.unique).toBe(true)
    expect(indexWhere(userWhatsAppPhones, name)).toContain('"verified_at" is not null')
  })

  test('carries the target, the declared phone, the code hash, the attempts and the validity', () => {
    expect(columnNames(whatsAppPhoneVerificationRequests)).toEqual([
      'id',
      'company_id',
      'user_id',
      'phone',
      'code_hash',
      'attempt_count',
      'expires_at',
      'consumed_at',
      'created_at',
    ])
    expect(columnNames(whatsAppPhoneVerificationRequests)).not.toContain('status')
  })

  test('ties the request to a membership of that same company', () => {
    expect(foreignKeyNames(whatsAppPhoneVerificationRequests)).toEqual([
      'whatsapp_phone_verification_requests_company_id_companies_id_fk',
      'whatsapp_phone_verification_requests_membership_fk',
    ])
  })

  test('constrains phone, hash, attempts ceiling and validity window', () => {
    const table = whatsAppPhoneVerificationRequests
    expect(checkSql(table, 'whatsapp_phone_verification_requests_phone_check')).toContain(
      '^55[1-9][0-9]{9,10}$',
    )
    expect(checkSql(table, 'whatsapp_phone_verification_requests_code_hash_check')).toContain(
      '^[0-9a-f]{64}$',
    )
    expect(checkSql(table, 'whatsapp_phone_verification_requests_attempt_count_check')).toContain(
      'between 0 and 5',
    )
    expect(checkSql(table, 'whatsapp_phone_verification_requests_expires_at_check')).toBeDefined()
  })

  test('keeps one live request per user and company', () => {
    const name = 'whatsapp_phone_verification_requests_company_id_user_id_live_unique'
    expect(findIndex(whatsAppPhoneVerificationRequests, name)?.config.unique).toBe(true)
    expect(indexWhere(whatsAppPhoneVerificationRequests, name)).toContain('"consumed_at" is null')
  })

  test('reaches the live request by the phone that sent the message, inside the company', () => {
    const name = 'whatsapp_phone_verification_requests_company_id_phone_live_idx'
    const index = findIndex(whatsAppPhoneVerificationRequests, name)
    expect(index?.config.unique).toBe(false)
    expect(indexWhere(whatsAppPhoneVerificationRequests, name)).toContain('"consumed_at" is null')
  })

  /** Seis dígitos são um milhão de códigos: um unique global colidiria entre empresas (plan § Dados). */
  test('has no unique on the code hash, because the lookup is by the live request of the phone', () => {
    const table = whatsAppPhoneVerificationRequests
    const uniqueColumns = getTableConfig(table).uniqueConstraints.flatMap((constraint) =>
      constraint.columns.map((column) => column.name),
    )
    const uniqueIndexColumns = getTableConfig(table)
      .indexes.filter((index) => index.config.unique)
      .flatMap((index) =>
        index.config.columns.map((column) => ('name' in column ? column.name : '')),
      )

    expect(uniqueColumns).not.toContain('code_hash')
    expect(uniqueIndexColumns).not.toContain('code_hash')
  })
})
