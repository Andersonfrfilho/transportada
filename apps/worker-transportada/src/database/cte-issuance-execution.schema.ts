/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import type {
  CteBatchProgressStatus,
  CteIssuanceItemStatus,
} from '../cte-issuance/domain/cte-batch-progress.policy.js'

export type CteFiscalEnvironment = 'homologation' | 'production'
export type CteDocumentStatus = 'authorized' | 'cancelled'

export const cteIssuancePayloads = pgTable('cte_issuance_payloads', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  batchItemId: uuid('batch_item_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  payload: jsonb().notNull(),
  payloadSha256: text('payload_sha256').notNull(),
  providerConfig: jsonb('provider_config').notNull(),
})

/** Cópia da tabela mantida pela API: aqui o worker só avança a numeração quando a SEFAZ recusa. */
export const fiscalSequences = pgTable('fiscal_sequences', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  environment: text().$type<CteFiscalEnvironment>().notNull(),
  model: text().notNull(),
  series: bigint({ mode: 'bigint' }).notNull(),
  nextNumber: bigint('next_number', { mode: 'bigint' }).notNull(),
  lastReservedNumber: bigint('last_reserved_number', { mode: 'bigint' }),
  version: bigint({ mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const cteIssuanceAttempts = pgTable('cte_issuance_attempts', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  batchItemId: uuid('batch_item_id').notNull(),
  status: text().$type<CteIssuanceItemStatus>().notNull(),
  fiscalSeries: text('fiscal_series').notNull(),
  fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }).notNull(),
  lastErrorCode: text('last_error_code'),
  lastErrorCause: text('last_error_cause'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const cteIssuanceEvents = pgTable('cte_issuance_events', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  batchItemId: uuid('batch_item_id').notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
})

export const cteFiscalDocuments = pgTable('cte_fiscal_documents', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  batchItemId: uuid('batch_item_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  accessKey: text('access_key').notNull(),
  authorizationProtocol: text('authorization_protocol').notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<CteFiscalEnvironment>().notNull(),
  fiscalSeries: text('fiscal_series').notNull(),
  fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }).notNull(),
  status: text().$type<CteDocumentStatus>().notNull(),
  xmlObjectId: uuid('xml_object_id').notNull(),
  xmlSha256: text('xml_sha256').notNull(),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  cancellationJustification: text('cancellation_justification'),
  cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
  cancellationProtocol: text('cancellation_protocol'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationXmlObjectId: uuid('cancellation_xml_object_id'),
  cancellationXmlSha256: text('cancellation_xml_sha256'),
})

export const cteBatches = pgTable('cte_batches', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  status: text().$type<CteBatchProgressStatus>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const cteBatchItems = pgTable('cte_batch_items', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  batchId: uuid('batch_id').notNull(),
})

export const cteBatchEvents = pgTable('cte_batch_events', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
})

export const digitalCertificates = pgTable('digital_certificates', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  purpose: text().notNull(),
  version: bigint({ mode: 'bigint' }).notNull(),
  status: text().notNull(),
  secretEnvelope: jsonb('secret_envelope'),
  validatedCnpj: text('validated_cnpj').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
