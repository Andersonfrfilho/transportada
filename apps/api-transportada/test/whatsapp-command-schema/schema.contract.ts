/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import {
  databaseSchema,
  whatsAppCommandDocuments,
  whatsAppCommandRequests,
} from '../../src/database/database.schema.js'
import {
  WHATSAPP_COMMAND_DOCUMENT_KINDS,
  WHATSAPP_COMMAND_DOCUMENT_STATUSES,
  WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN,
  WHATSAPP_COMMAND_KINDS,
  WHATSAPP_COMMAND_SETTLEMENT_OUTCOMES,
  WHATSAPP_COMMAND_STATUSES,
  whatsAppCommandDocuments as directDocuments,
  whatsAppCommandRequests as directRequests,
} from '../../src/database/whatsapp-command.schema.js'

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

const uniqueColumns = (table: Table, name: string): readonly string[] | undefined =>
  getTableConfig(table)
    .uniqueConstraints.filter((constraint) => constraint.name === name)
    .at(0)
    ?.columns.map((column) => column.name)

const findIndex = (table: Table, name: string) =>
  getTableConfig(table)
    .indexes.filter((index) => index.config.name === name)
    .at(0)

const indexColumns = (table: Table, name: string): readonly string[] | undefined =>
  findIndex(table, name)?.config.columns.map((column) => ('name' in column ? column.name : ''))

const foreignKey = (table: Table, name: string) =>
  getTableConfig(table)
    .foreignKeys.filter((key) => key.getName() === name)
    .at(0)

const foreignKeyShape = (table: Table, name: string) => {
  const key = foreignKey(table, name)
  if (key === undefined) return undefined
  const reference = key.reference()
  return {
    columns: reference.columns.map((column) => column.name),
    foreignColumns: reference.foreignColumns.map((column) => column.name),
    foreignTable: getTableConfig(reference.foreignTable).name,
    onDelete: key.onDelete,
  }
}

describe('whatsapp command request schema', () => {
  test('keeps the database schema aggregator compatible with both tables', () => {
    expect(whatsAppCommandRequests).toBe(directRequests)
    expect(whatsAppCommandDocuments).toBe(directDocuments)
    expect(databaseSchema).toMatchObject({
      whatsAppCommandDocuments: directDocuments,
      whatsAppCommandRequests: directRequests,
    })
  })

  test('declares the vocabularies the constraints read', () => {
    expect(WHATSAPP_COMMAND_KINDS).toEqual(['document_issuance'])
    expect(WHATSAPP_COMMAND_STATUSES).toEqual([
      'previewed',
      'confirming',
      'dispatched',
      'settled',
      'settled_partial',
      'expired',
      'superseded',
    ])
    expect(WHATSAPP_COMMAND_DOCUMENT_KINDS).toEqual([
      'cte_batch',
      'nfse_invoice',
      'billing_invoice',
    ])
    expect(WHATSAPP_COMMAND_DOCUMENT_STATUSES).toEqual(['pending', 'created', 'issued', 'failed'])
  })

  test('freezes the preview with its actor, selection, classification and parameters', () => {
    expect(getTableConfig(whatsAppCommandRequests).name).toBe('whatsapp_command_requests')
    expect(columnNames(whatsAppCommandRequests)).toEqual([
      'id',
      'company_id',
      'actor_user_id',
      'membership_id',
      'kind',
      'selection',
      'classification',
      'preview_sha256',
      'due_date',
      'period',
      'grouping_mode',
      'status',
      'expires_at',
      'confirmed_at',
      'settled_at',
      'settlement_outcome',
      'last_error_code',
      'settlement_attempts',
      'next_settlement_at',
      'created_at',
      'updated_at',
    ])
  })

  test('ties the request to the company and to the membership of the actor in that company', () => {
    expect(
      foreignKeyShape(
        whatsAppCommandRequests,
        'whatsapp_command_requests_company_id_companies_id_fk',
      ),
    ).toEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      onDelete: 'restrict',
    })
    expect(
      foreignKeyShape(whatsAppCommandRequests, 'whatsapp_command_requests_actor_membership_fk'),
    ).toEqual({
      columns: ['actor_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      onDelete: 'restrict',
    })
    expect(
      foreignKeyShape(whatsAppCommandRequests, 'whatsapp_command_requests_membership_fk'),
    ).toEqual({
      columns: ['membership_id', 'company_id'],
      foreignColumns: ['id', 'company_id'],
      foreignTable: 'user_company_memberships',
      onDelete: 'restrict',
    })
    expect(
      uniqueColumns(whatsAppCommandRequests, 'whatsapp_command_requests_company_id_id_unique'),
    ).toEqual(['company_id', 'id'])
  })

  test('constrains kind, status, grouping, hash, period, jsonb shape and the time columns', () => {
    const table = whatsAppCommandRequests
    expect(checkSql(table, 'whatsapp_command_requests_kind_check')).toContain("'document_issuance'")
    expect(checkSql(table, 'whatsapp_command_requests_status_check')).toContain(
      "'previewed', 'confirming', 'dispatched', 'settled', 'settled_partial', 'expired', 'superseded'",
    )
    expect(checkSql(table, 'whatsapp_command_requests_grouping_mode_check')).toContain(
      "'per_invoice', 'sender_recipient'",
    )
    expect(checkSql(table, 'whatsapp_command_requests_preview_sha256_check')).toContain(
      '^[0-9a-f]{64}$',
    )
    expect(checkSql(table, 'whatsapp_command_requests_period_check')).toContain('<= 60')
    expect(checkSql(table, 'whatsapp_command_requests_selection_check')).toContain("'array'")
    expect(checkSql(table, 'whatsapp_command_requests_classification_check')).toContain("'array'")
    expect(checkSql(table, 'whatsapp_command_requests_expires_at_check')).toBeDefined()
    expect(checkSql(table, 'whatsapp_command_requests_confirmed_at_check')).toContain(
      '"confirmed_at" is not null',
    )
    expect(checkSql(table, 'whatsapp_command_requests_settled_at_check')).toContain(
      '"settled_at" is not null',
    )
  })

  /** Spec 144 T014: o vocabulário de `settlement_outcome` é da liquidação, e o CHECK o fecha. */
  test('constrains the settlement outcome to the vocabulary of the settlement', () => {
    expect(WHATSAPP_COMMAND_SETTLEMENT_OUTCOMES).toEqual([
      'completed',
      'timed_out',
      'actor_not_authorized',
      'billing_failed',
      'settlement_failed',
    ])
    const settlementCheck = checkSql(
      whatsAppCommandRequests,
      'whatsapp_command_requests_settlement_outcome_check',
    )
    expect(settlementCheck).toContain('"settlement_outcome" is null')
    expect(settlementCheck).toContain(
      "'completed', 'timed_out', 'actor_not_authorized', 'billing_failed', 'settlement_failed'",
    )
  })

  /** Spec 144 T020 (B2): a contagem de tentativas nunca é negativa. */
  test('constrains the settlement attempts to a non-negative count', () => {
    expect(
      checkSql(whatsAppCommandRequests, 'whatsapp_command_requests_settlement_attempts_check'),
    ).toContain('"settlement_attempts" >= 0')
  })

  test('indexes the settlement sweep by company and status, and partially for work in flight', () => {
    expect(
      indexColumns(whatsAppCommandRequests, 'whatsapp_command_requests_company_id_status_idx'),
    ).toEqual(['company_id', 'status'])
    const where = findIndex(whatsAppCommandRequests, 'whatsapp_command_requests_in_flight_idx')
      ?.config.where
    expect(where === undefined ? undefined : dialect.sqlToQuery(where).sql).toContain(
      "in ('dispatched', 'confirming')",
    )
  })
})

describe('whatsapp command journal schema', () => {
  test('keeps one step per group, with its key, its state and the document once it exists', () => {
    expect(getTableConfig(whatsAppCommandDocuments).name).toBe('whatsapp_command_documents')
    expect(columnNames(whatsAppCommandDocuments)).toEqual([
      'id',
      'company_id',
      'request_id',
      'document_kind',
      'group_key',
      'idempotency_key',
      'status',
      'document_id',
      'last_error_code',
      'created_at',
      'updated_at',
    ])
    expect(
      uniqueColumns(
        whatsAppCommandDocuments,
        'whatsapp_command_documents_request_kind_group_unique',
      ),
    ).toEqual(['request_id', 'document_kind', 'group_key'])
  })

  test('reaches the request only inside the same company, and dies with it', () => {
    expect(
      foreignKeyShape(whatsAppCommandDocuments, 'whatsapp_command_documents_request_fk'),
    ).toEqual({
      columns: ['company_id', 'request_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'whatsapp_command_requests',
      onDelete: 'cascade',
    })
  })

  test('constrains kind, status, the idempotency key and a document behind every created step', () => {
    const table = whatsAppCommandDocuments
    expect(checkSql(table, 'whatsapp_command_documents_document_kind_check')).toContain(
      "'cte_batch', 'nfse_invoice', 'billing_invoice'",
    )
    expect(checkSql(table, 'whatsapp_command_documents_status_check')).toContain(
      "'pending', 'created', 'issued', 'failed'",
    )
    const idempotencyCheck = checkSql(table, 'whatsapp_command_documents_idempotency_key_check')
    expect(idempotencyCheck).toContain("'^[A-Za-z0-9._:-]+$'")
    expect(idempotencyCheck).toContain('between 16 and 256')
    expect(WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN.source).toBe('^[A-Za-z0-9._:-]{16,256}$')
    expect(checkSql(table, 'whatsapp_command_documents_document_id_check')).toContain(
      '"document_id" is not null',
    )
  })
})
