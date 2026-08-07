/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { cteBatchItems, cteBatches } from './cte-batch.schema.js'
import { fiscalSequenceReservations } from './fiscal-sequence.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { storedObjects } from './storage.schema.js'

export const CTE_ATTEMPT_KINDS = ['issue', 'reprocess', 'cancel'] as const
export const CTE_ISSUANCE_STATUSES = [
  'pending',
  'in_flight',
  'authorized',
  'rejected',
  'retry_scheduled',
  'failed',
  'reconciliation_required',
  'cancelled',
] as const
export const CTE_DOCUMENT_STATUSES = ['authorized', 'cancelled'] as const
export const CTE_RETRY_STATUSES = ['scheduled', 'claimed', 'exhausted', 'cancelled'] as const
export const CTE_ISSUANCE_EVENTS = [
  'issue_requested',
  'cancel_requested',
  'in_flight',
  'authorized',
  'rejected',
  'failed',
  'retry_scheduled',
  'reconciliation_required',
  'cancelled',
  'fiscal_number_advanced',
] as const
export const CTE_FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export const CTE_ISSUANCE_OUTBOX_EVENT_TYPES = [
  'transportada.cte.item.issue.requested',
  'transportada.cte.item.cancel.requested',
] as const
export const CTE_ISSUANCE_OUTBOX_ATTEMPT_KINDS = ['issue', 'reprocess', 'cancel'] as const
export const CTE_ISSUANCE_OUTBOX_STATUSES = ['requested', 'retry_scheduled'] as const

export const cteIssuanceAttempts = pgTable(
  'cte_issuance_attempts',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    batchItemId: uuid('batch_item_id').notNull(),
    attemptKind: text('attempt_kind').$type<(typeof CTE_ATTEMPT_KINDS)[number]>().notNull(),
    attemptNumber: bigint('attempt_number', { mode: 'bigint' }).notNull(),
    status: text().$type<(typeof CTE_ISSUANCE_STATUSES)[number]>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    idempotencyFingerprint: text('idempotency_fingerprint').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    fiscalEnvironment: text('fiscal_environment')
      .$type<(typeof CTE_FISCAL_ENVIRONMENTS)[number]>()
      .notNull(),
    fiscalSeries: text('fiscal_series').notNull(),
    fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }).notNull(),
    reservationId: uuid('reservation_id').notNull(),
    lastErrorCode: text('last_error_code'),
    lastErrorCause: text('last_error_cause'),
    correlationId: text('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_issuance_attempts_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'cte_issuance_attempts_company_batch_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchItemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'cte_issuance_attempts_company_batch_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.reservationId],
      foreignColumns: [fiscalSequenceReservations.companyId, fiscalSequenceReservations.id],
      name: 'cte_issuance_attempts_company_reservation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_issuance_attempts_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_issuance_attempts_company_item_kind_fingerprint_unique').on(
      table.companyId,
      table.batchItemId,
      table.attemptKind,
      table.requestFingerprint,
    ),
    unique('cte_issuance_attempts_company_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    index('cte_issuance_attempts_company_status_created_at_idx').on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
    check(
      'cte_issuance_attempts_status_check',
      sql`${table.status} in ('pending', 'in_flight', 'authorized', 'rejected', 'retry_scheduled', 'failed', 'reconciliation_required', 'cancelled')`,
    ),
    check(
      'cte_issuance_attempts_kind_check',
      sql`${table.attemptKind} in ('issue', 'reprocess', 'cancel')`,
    ),
    check('cte_issuance_attempts_attempt_number_check', sql`${table.attemptNumber} > 0`),
    check(
      'cte_issuance_attempts_environment_check',
      sql`${table.fiscalEnvironment} in ('homologation', 'production')`,
    ),
    check('cte_issuance_attempts_fiscal_number_check', sql`${table.fiscalNumber} > 0`),
    check('cte_issuance_attempts_idempotency_key_check', sql`length(${table.idempotencyKey}) > 0`),
    check(
      'cte_issuance_attempts_request_fingerprint_check',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
  ],
)

export const cteFiscalDocuments = pgTable(
  'cte_fiscal_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    batchItemId: uuid('batch_item_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    accessKey: text('access_key').notNull(),
    authorizationProtocol: text('authorization_protocol').notNull(),
    fiscalEnvironment: text('fiscal_environment')
      .$type<(typeof CTE_FISCAL_ENVIRONMENTS)[number]>()
      .notNull(),
    fiscalSeries: text('fiscal_series').notNull(),
    fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }).notNull(),
    status: text().$type<(typeof CTE_DOCUMENT_STATUSES)[number]>().notNull(),
    xmlObjectId: uuid('xml_object_id').notNull(),
    xmlSha256: text('xml_sha256').notNull(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    cancellationJustification: text('cancellation_justification'),
    cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
    cancellationProtocol: text('cancellation_protocol'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationXmlObjectId: uuid('cancellation_xml_object_id'),
    cancellationXmlSha256: text('cancellation_xml_sha256'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_fiscal_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchItemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'cte_fiscal_documents_company_batch_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [cteIssuanceAttempts.companyId, cteIssuanceAttempts.id],
      name: 'cte_fiscal_documents_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.xmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'cte_fiscal_documents_company_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.cancellationXmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'cte_fiscal_documents_company_cancellation_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_fiscal_documents_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_fiscal_documents_company_access_key_unique').on(table.companyId, table.accessKey),
    unique('cte_fiscal_documents_company_batch_item_unique').on(table.companyId, table.batchItemId),
    check('cte_fiscal_documents_access_key_check', sql`${table.accessKey} ~ '^[0-9]{44}$'`),
    check('cte_fiscal_documents_status_check', sql`${table.status} in ('authorized', 'cancelled')`),
    check(
      'cte_fiscal_documents_environment_check',
      sql`${table.fiscalEnvironment} in ('homologation', 'production')`,
    ),
    check('cte_fiscal_documents_sha256_check', sql`${table.xmlSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      'cte_fiscal_documents_cancellation_justification_check',
      sql`${table.cancellationJustification} is null or length(${table.cancellationJustification}) >= 15`,
    ),
    check(
      'cte_fiscal_documents_cancellation_sha256_check',
      sql`${table.cancellationXmlSha256} is null or ${table.cancellationXmlSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'cte_fiscal_documents_cancellation_xml_check',
      sql`(${table.cancellationXmlObjectId} is null) = (${table.cancellationXmlSha256} is null)`,
    ),
    check(
      'cte_fiscal_documents_cancelled_state_check',
      sql`${table.status} <> 'cancelled' or (${table.cancellationProtocol} is not null and ${table.cancellationJustification} is not null and ${table.cancelledAt} is not null)`,
    ),
  ],
)

export const cteIssuanceEvents = pgTable(
  'cte_issuance_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    batchItemId: uuid('batch_item_id').notNull(),
    eventName: text('event_name').$type<(typeof CTE_ISSUANCE_EVENTS)[number]>().notNull(),
    payload: jsonb().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_issuance_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [cteIssuanceAttempts.companyId, cteIssuanceAttempts.id],
      name: 'cte_issuance_events_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchItemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'cte_issuance_events_company_batch_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_issuance_events_company_id_id_unique').on(table.companyId, table.id),
    index('cte_issuance_events_company_batch_item_created_at_idx').on(
      table.companyId,
      table.batchItemId,
      table.createdAt,
    ),
    check(
      'cte_issuance_events_name_check',
      sql`${table.eventName} in ('issue_requested', 'cancel_requested', 'in_flight', 'authorized', 'rejected', 'failed', 'retry_scheduled', 'reconciliation_required', 'cancelled', 'fiscal_number_advanced')`,
    ),
  ],
)

export const cteRetrySchedules = pgTable(
  'cte_retry_schedules',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    batchItemId: uuid('batch_item_id').notNull(),
    status: text().$type<(typeof CTE_RETRY_STATUSES)[number]>().notNull(),
    attemptCount: bigint('attempt_count', { mode: 'bigint' }).notNull().default(0n),
    maxAttempts: bigint('max_attempts', { mode: 'bigint' }).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    lastErrorCause: text('last_error_cause'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_retry_schedules_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [cteIssuanceAttempts.companyId, cteIssuanceAttempts.id],
      name: 'cte_retry_schedules_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchItemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'cte_retry_schedules_company_batch_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_retry_schedules_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_retry_schedules_company_attempt_unique').on(table.companyId, table.attemptId),
    index('cte_retry_schedules_company_status_next_attempt_idx').on(
      table.companyId,
      table.status,
      table.nextAttemptAt,
    ),
    check(
      'cte_retry_schedules_status_check',
      sql`${table.status} in ('scheduled', 'claimed', 'exhausted', 'cancelled')`,
    ),
    check('cte_retry_schedules_attempt_count_check', sql`${table.attemptCount} >= 0`),
    check('cte_retry_schedules_max_attempts_check', sql`${table.maxAttempts} > 0`),
  ],
)

export const cteIssuancePayloads = pgTable(
  'cte_issuance_payloads',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    batchItemId: uuid('batch_item_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    payload: jsonb().notNull(),
    providerConfig: jsonb('provider_config').notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_issuance_payloads_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'cte_issuance_payloads_company_batch_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchItemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'cte_issuance_payloads_company_batch_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [cteIssuanceAttempts.companyId, cteIssuanceAttempts.id],
      name: 'cte_issuance_payloads_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_issuance_payloads_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_issuance_payloads_company_attempt_unique').on(table.companyId, table.attemptId),
    index('cte_issuance_payloads_company_batch_item_created_at_idx').on(
      table.companyId,
      table.batchItemId,
      table.createdAt,
    ),
    check('cte_issuance_payloads_sha256_check', sql`${table.payloadSha256} ~ '^[0-9a-f]{64}$'`),
  ],
)

export const cteIssuanceOutbox = pgTable(
  'cte_issuance_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateSubtype: text('aggregate_subtype').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    batchItemId: uuid('batch_item_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    attemptKind: text('attempt_kind')
      .$type<(typeof CTE_ISSUANCE_OUTBOX_ATTEMPT_KINDS)[number]>()
      .notNull(),
    status: text('status').$type<(typeof CTE_ISSUANCE_OUTBOX_STATUSES)[number]>().notNull(),
    eventType: text('event_type')
      .$type<(typeof CTE_ISSUANCE_OUTBOX_EVENT_TYPES)[number]>()
      .notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
    attemptFingerprint: text('attempt_fingerprint').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb().notNull(),
    claimOwner: text('claim_owner'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_issuance_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.aggregateId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'cte_issuance_outbox_company_aggregate_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'cte_issuance_outbox_company_batch_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchItemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'cte_issuance_outbox_company_batch_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [cteIssuanceAttempts.companyId, cteIssuanceAttempts.id],
      name: 'cte_issuance_outbox_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cte_issuance_outbox_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_issuance_outbox_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_issuance_outbox_company_id_event_id_unique').on(table.companyId, table.eventId),
    index('cte_issuance_outbox_company_published_next_attempt_created_idx').on(
      table.companyId,
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check(
      'cte_issuance_outbox_attempt_kind_check',
      sql`${table.attemptKind} in ('issue', 'reprocess', 'cancel')`,
    ),
    check(
      'cte_issuance_outbox_status_check',
      sql`${table.status} in ('requested', 'retry_scheduled')`,
    ),
    check(
      'cte_issuance_outbox_event_type_check',
      sql`${table.eventType} in ('transportada.cte.item.issue.requested', 'transportada.cte.item.cancel.requested')`,
    ),
    check('cte_issuance_outbox_attempt_version_check', sql`${table.eventVersion} > 0`),
    check(
      'cte_issuance_outbox_attempt_check',
      sql`((${table.claimOwner} is null) = (${table.claimExpiresAt} is null))`,
    ),
  ],
)

/**
 * Ledger de idempotência do trilho CT-e. Não referencia o outbox de origem de propósito: amarrar
 * este ledger a uma tabela de outbox específica foi o que impediu o consumidor de gravar.
 */
export const cteProcessedMessages = pgTable(
  'cte_processed_messages',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    consumerName: text('consumer_name').notNull(),
    eventId: uuid('event_id').notNull(),
    batchItemId: uuid('batch_item_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    result: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_processed_messages_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_processed_messages_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_processed_messages_company_consumer_event_unique').on(
      table.companyId,
      table.consumerName,
      table.eventId,
    ),
  ],
)

export const CTE_DIAGNOSTICS_PHASES = ['request', 'response', 'error'] as const
export type CteDiagnosticsPhase = (typeof CTE_DIAGNOSTICS_PHASES)[number]

/**
 * Registro temporário do que saiu para o provedor fiscal e do que voltou. Existe porque o código
 * de rejeição sozinho não diz qual campo a SEFAZ condenou, e porque erro fora da rejeição chegava
 * a morrer sem rastro nenhum. Só a empresa tem chave estrangeira: lote, item e tentativa ficam
 * indexados sem `restrict` para a linha poder ser expurgada em `expires_at` sem travar nada.
 */
export const cteIssuanceDiagnostics = pgTable(
  'cte_issuance_diagnostics',
  {
    id: uuid().defaultRandom().primaryKey(),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_issuance_diagnostics_company_id_companies_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('cte_issuance_diagnostics_company_id_id_unique').on(table.companyId, table.id),
    index('cte_issuance_diagnostics_company_item_occurred_at_idx').on(
      table.companyId,
      table.batchItemId,
      table.occurredAt,
    ),
    index('cte_issuance_diagnostics_company_attempt_idx').on(table.companyId, table.attemptId),
    index('cte_issuance_diagnostics_expires_at_idx').on(table.expiresAt),
    check(
      'cte_issuance_diagnostics_phase_check',
      sql`${table.phase} in ('request', 'response', 'error')`,
    ),
    check('cte_issuance_diagnostics_duration_check', sql`${table.durationMs} >= 0`),
  ],
)
