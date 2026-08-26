/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
  /** Lidos só para o aviso de falha: quem abriu o lote e como ele se chama na tela. */
  operatorUserId: uuid('operator_user_id').notNull(),
  name: text().notNull(),
  status: text().$type<CteBatchProgressStatus>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const cteBatchItems = pgTable('cte_batch_items', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  /** ADR-0047: a ponte da nota até a viagem — é por ela que a autorização acha o que manifestar. */
  nfeDocumentId: uuid('nfe_document_id').notNull(),
})

/**
 * ⚠️ **Cópia por valor** de `api-transportada/src/database/trip.schema.ts`, com as colunas que o
 * gatilho do MDF-e lê e nada mais. As duas apps não importam código uma da outra; migration só roda
 * na API. Mudou a tabela lá? confira aqui.
 */
export const tripDocuments = pgTable('trip_documents', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  tripId: uuid('trip_id').notNull(),
  /** Anulável na origem: a viagem também carrega nota vinda de cálculo de frete. */
  nfeDocumentId: uuid('nfe_document_id'),
})

export const cteBatchEvents = pgTable('cte_batch_events', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
})

export const CERTIFICATE_STATUSES = ['active', 'retired'] as const
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number]

/**
 * `valid_from` e `expires_at` entraram com a rotina de distribuição, que pré-filtra empresa por
 * certificado dentro da janela — quem só abre o envelope para assinar não precisava da vigência.
 */
export const digitalCertificates = pgTable('digital_certificates', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  purpose: text().notNull(),
  version: bigint({ mode: 'bigint' }).notNull(),
  status: text().$type<CertificateStatus>().notNull(),
  secretEnvelope: jsonb('secret_envelope'),
  validatedCnpj: text('validated_cnpj').notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export type CteDiagnosticsPhase = 'error' | 'request' | 'response'

/**
 * Cópia da tabela mantida pela API. Guarda o que saiu para o provedor fiscal e o que voltou —
 * é o único lugar onde a resposta crua da SEFAZ sobrevive à tentativa. Linha expira em `expires_at`.
 */
export const cteIssuanceDiagnostics = pgTable('cte_issuance_diagnostics', {
  id: uuid().primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  batchItemId: uuid('batch_item_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  attemptKind: text('attempt_kind').notNull(),
  eventId: uuid('event_id').notNull(),
  correlationId: text('correlation_id'),
  phase: text().$type<CteDiagnosticsPhase>().notNull(),
  request: jsonb(),
  response: jsonb(),
  error: jsonb(),
  durationMs: integer('duration_ms'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
