/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import {
  databaseSchema,
  PASSWORD_RESET_DELIVERY_EVENT_TYPES,
  passwordResetDeliveryOutbox,
  passwordResetRequests,
} from '../../src/database/database.schema.js'
import {
  PASSWORD_RESET_DELIVERY_EVENT_TYPES as directEventTypes,
  passwordResetDeliveryOutbox as directOutbox,
  passwordResetRequests as directRequests,
} from '../../src/database/password-reset.schema.js'

const dialect = new PgDialect()

const columnNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table).columns.map((column) => column.name)

const checkNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table).checks.map((constraint) => constraint.name)

const uniqueNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.name)
    .filter((name): name is string => name !== undefined)

const indexNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table)
    .indexes.map((index) => index.config.name)
    .filter((name): name is string => name !== undefined)

const checkSql = (
  table: Parameters<typeof getTableConfig>[0],
  name: string,
): string | undefined => {
  const constraint = getTableConfig(table)
    .checks.filter((candidate) => candidate.name === name)
    .at(0)

  return constraint === undefined ? undefined : dialect.sqlToQuery(constraint.value).sql
}

const foreignKeyNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table).foreignKeys.map((key) => key.getName())

describe('password reset schema', () => {
  test('keeps the database schema aggregator compatible with the reset tables', () => {
    expect(PASSWORD_RESET_DELIVERY_EVENT_TYPES).toBe(directEventTypes)
    expect(passwordResetRequests).toBe(directRequests)
    expect(passwordResetDeliveryOutbox).toBe(directOutbox)
    expect(databaseSchema).toMatchObject({
      passwordResetDeliveryOutbox: directOutbox,
      passwordResetRequests: directRequests,
    })
  })

  test('names the two tables the reset lifecycle needs', () => {
    expect(
      [passwordResetRequests, passwordResetDeliveryOutbox].map(
        (table) => getTableConfig(table).name,
      ),
    ).toEqual(['password_reset_requests', 'password_reset_delivery_outbox'])
  })

  test('carries the target, the company, the code hash, the validity and the attempts', () => {
    expect(columnNames(passwordResetRequests)).toEqual([
      'id',
      'company_id',
      'user_id',
      'code_hash',
      'sealed_code',
      'delivered_at',
      'attempt_count',
      'expires_at',
      'consumed_at',
      'created_at',
      'updated_at',
    ])
  })

  test('has no status column: consumption and expiry are the only states', () => {
    // Status seria uma terceira verdade ao lado de `consumed_at` e `expires_at`, e as três
    // discordariam no primeiro caminho que esquecesse de atualizar a coluna.
    expect(columnNames(passwordResetRequests)).not.toContain('status')
  })

  test('reaches the request by hash alone, because the confirm route has no tenant', () => {
    expect(uniqueNames(passwordResetRequests)).toContain('password_reset_requests_code_hash_unique')
  })

  test('keeps one live request per user and company', () => {
    expect(indexNames(passwordResetRequests)).toContain(
      'password_reset_requests_company_id_user_id_live_unique',
    )
  })

  test('ties the target to a membership of that same company', () => {
    expect(foreignKeyNames(passwordResetRequests)).toContain(
      'password_reset_requests_membership_fk',
    )
  })

  test('constrains the hash, the attempts and the validity window', () => {
    expect(checkNames(passwordResetRequests)).toEqual([
      'password_reset_requests_code_hash_check',
      'password_reset_requests_attempt_count_check',
      'password_reset_requests_expires_at_check',
    ])
    expect(checkSql(passwordResetRequests, 'password_reset_requests_code_hash_check')).toContain(
      '^[0-9a-f]{64}$',
    )
  })

  test('carries a reference payload on its own delivery trail', () => {
    expect(columnNames(passwordResetDeliveryOutbox)).toEqual([
      'id',
      'event_id',
      'company_id',
      'request_id',
      'event_type',
      'event_version',
      'correlation_id',
      'payload',
      'attempt',
      'claim_owner',
      'claim_expires_at',
      'next_attempt_at',
      'published_at',
      'created_at',
      'updated_at',
    ])
  })

  test('has no actor column: nobody is authenticated when a reset is requested', () => {
    expect(columnNames(passwordResetDeliveryOutbox)).not.toContain('actor_user_id')
  })

  test('names the single event the trail publishes', () => {
    expect(PASSWORD_RESET_DELIVERY_EVENT_TYPES).toEqual([
      'transportada.identity.password-reset.code.requested',
    ])
  })

  test('claims the outbox row atomically, like the other trails', () => {
    expect(checkNames(passwordResetDeliveryOutbox)).toContain(
      'password_reset_delivery_outbox_claim_check',
    )
  })
})
