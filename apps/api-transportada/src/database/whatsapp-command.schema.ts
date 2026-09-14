/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  date,
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

import type { DocumentOutputClassification } from '../cte-profiles/domain/document-output.policy.js'
import {
  CTE_EMISSION_GROUPING_MODES,
  type CteEmissionGroupingMode,
} from './cte-emission-profile.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

export const WHATSAPP_COMMAND_KINDS = ['document_issuance'] as const
export type WhatsAppCommandKind = (typeof WHATSAPP_COMMAND_KINDS)[number]

/** `confirming` é trabalho em curso: é ele que deixa retomar a confirmação que caiu no meio (D6). */
export const WHATSAPP_COMMAND_STATUSES = [
  'previewed',
  'confirming',
  'dispatched',
  'settled',
  'settled_partial',
  'expired',
  'superseded',
] as const
export type WhatsAppCommandStatus = (typeof WHATSAPP_COMMAND_STATUSES)[number]

export const WHATSAPP_COMMAND_DOCUMENT_KINDS = [
  'cte_batch',
  'nfse_invoice',
  'billing_invoice',
] as const
export type WhatsAppCommandDocumentKind = (typeof WHATSAPP_COMMAND_DOCUMENT_KINDS)[number]

export const WHATSAPP_COMMAND_DOCUMENT_STATUSES = [
  'pending',
  'created',
  'issued',
  'failed',
] as const
export type WhatsAppCommandDocumentStatus = (typeof WHATSAPP_COMMAND_DOCUMENT_STATUSES)[number]

/**
 * Por que o pedido liquidou como liquidou (T014). O status diz só se foi inteiro ou em parte;
 * `completed` é o único código de `settled`, os outros são de `settled_partial`.
 * `settlement_failed` (T020) é a liquidação que lançou erro fora do domínio até esgotar as
 * tentativas: o pedido encerra em vez de voltar à varredura para sempre.
 */
export const WHATSAPP_COMMAND_SETTLEMENT_OUTCOMES = [
  'completed',
  'timed_out',
  'actor_not_authorized',
  'billing_failed',
  'settlement_failed',
] as const
export type WhatsAppCommandSettlementCode = (typeof WHATSAPP_COMMAND_SETTLEMENT_OUTCOMES)[number]

/** Mesmo teto do `period` de `POST /nfse-service-invoices` (`MAX_PERIOD_LENGTH`). */
export const WHATSAPP_COMMAND_PERIOD_MAX_LENGTH = 60

/** Mesmo formato da chave de idempotência das rotas de lote, NFS-e e fatura. */
export const WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,256}$/
export const WHATSAPP_COMMAND_IDEMPOTENCY_KEY_LENGTH = { max: 256, min: 16 } as const

/** Estados que já passaram pela confirmação e, portanto, têm `confirmed_at`. */
const CONFIRMED_STATUSES = ['confirming', 'dispatched', 'settled', 'settled_partial'] as const
const SETTLED_STATUSES = ['settled', 'settled_partial'] as const
const DOCUMENT_BEARING_STATUSES = ['created', 'issued'] as const

export type WhatsAppCommandSelection = readonly string[]

/**
 * `profileId`, `profileName` e `takerTaxId` são o grupo da nota, congelados para a confirmação
 * (spec 144 T013) montar lote e NFS-e sem reclassificar — depois do primeiro lote a nota já está
 * vinculada e a classificação muda. Opcionais porque o pedido anterior à T013 não os tem.
 */
export type WhatsAppCommandClassificationEntry = Readonly<{
  classification: DocumentOutputClassification
  documentId: string
  profileId?: string | null
  profileName?: string | null
  takerTaxId?: string | null
}>

/**
 * A prévia congelada (spec 144 D5): o que o usuário viu, com o hash do que ele viu. `selection`
 * guarda só ids; o que decide o documento é `classification`, e o hash cobre valores e versões.
 */
export const whatsAppCommandRequests = pgTable(
  'whatsapp_command_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    kind: text().$type<WhatsAppCommandKind>().notNull(),
    selection: jsonb().$type<WhatsAppCommandSelection>().notNull(),
    classification: jsonb().$type<readonly WhatsAppCommandClassificationEntry[]>().notNull(),
    previewSha256: text('preview_sha256').notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    period: text(),
    groupingMode: text('grouping_mode').$type<CteEmissionGroupingMode>(),
    status: text().$type<WhatsAppCommandStatus>().notNull().default('previewed'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    settlementOutcome: text('settlement_outcome').$type<WhatsAppCommandSettlementCode>(),
    lastErrorCode: text('last_error_code'),
    /** T020: tentativas de liquidação que lançaram erro fora do domínio, e quando voltar a tentar. */
    settlementAttempts: integer('settlement_attempts').notNull().default(0),
    nextSettlementAt: timestamp('next_settlement_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_command_requests_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'whatsapp_command_requests_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** Com a FK do ator, a membership é da empresa; ser a DO ator o repositório garante pelo subselect. */
    foreignKey({
      columns: [table.membershipId, table.companyId],
      foreignColumns: [userCompanyMemberships.id, userCompanyMemberships.companyId],
      name: 'whatsapp_command_requests_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('whatsapp_command_requests_company_id_id_unique').on(table.companyId, table.id),
    index('whatsapp_command_requests_company_id_status_idx').on(table.companyId, table.status),
    index('whatsapp_command_requests_in_flight_idx')
      .on(table.status, table.confirmedAt)
      .where(sql`${table.status} in ('dispatched', 'confirming')`),
    check(
      'whatsapp_command_requests_kind_check',
      sql`${table.kind} in (${sql.raw(inList(WHATSAPP_COMMAND_KINDS))})`,
    ),
    check(
      'whatsapp_command_requests_status_check',
      sql`${table.status} in (${sql.raw(inList(WHATSAPP_COMMAND_STATUSES))})`,
    ),
    check(
      'whatsapp_command_requests_grouping_mode_check',
      sql`${table.groupingMode} is null or ${table.groupingMode} in (${sql.raw(inList(CTE_EMISSION_GROUPING_MODES))})`,
    ),
    check(
      'whatsapp_command_requests_preview_sha256_check',
      sql`${table.previewSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'whatsapp_command_requests_period_check',
      sql`${table.period} is null or length(${table.period}) <= ${sql.raw(String(WHATSAPP_COMMAND_PERIOD_MAX_LENGTH))}`,
    ),
    check(
      'whatsapp_command_requests_selection_check',
      sql`jsonb_typeof(${table.selection}) = 'array'`,
    ),
    check(
      'whatsapp_command_requests_classification_check',
      sql`jsonb_typeof(${table.classification}) = 'array'`,
    ),
    check(
      'whatsapp_command_requests_expires_at_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'whatsapp_command_requests_confirmed_at_check',
      sql`${table.status} not in (${sql.raw(inList(CONFIRMED_STATUSES))}) or ${table.confirmedAt} is not null`,
    ),
    check(
      'whatsapp_command_requests_settled_at_check',
      sql`${table.status} not in (${sql.raw(inList(SETTLED_STATUSES))}) or ${table.settledAt} is not null`,
    ),
    check(
      'whatsapp_command_requests_settlement_outcome_check',
      sql`${table.settlementOutcome} is null or ${table.settlementOutcome} in (${sql.raw(inList(WHATSAPP_COMMAND_SETTLEMENT_OUTCOMES))})`,
    ),
    check(
      'whatsapp_command_requests_settlement_attempts_check',
      sql`${table.settlementAttempts} >= 0`,
    ),
  ],
)

/**
 * O diário de passos da confirmação (D6): uma linha por grupo, nascida `pending` na mesma transação
 * que passa o pedido a `confirming`. A chave de idempotência sai do pedido, e é ela que faz a
 * retomada convergir em vez de emitir de novo.
 */
export const whatsAppCommandDocuments = pgTable(
  'whatsapp_command_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    requestId: uuid('request_id').notNull(),
    documentKind: text('document_kind').$type<WhatsAppCommandDocumentKind>().notNull(),
    /** profileId · `${nfseProfileId}:${takerTaxId}` · takerTaxId, conforme o `document_kind`. */
    groupKey: text('group_key').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text().$type<WhatsAppCommandDocumentStatus>().notNull().default('pending'),
    documentId: uuid('document_id'),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.requestId],
      foreignColumns: [whatsAppCommandRequests.companyId, whatsAppCommandRequests.id],
      name: 'whatsapp_command_documents_request_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('whatsapp_command_documents_request_kind_group_unique').on(
      table.requestId,
      table.documentKind,
      table.groupKey,
    ),
    check(
      'whatsapp_command_documents_document_kind_check',
      sql`${table.documentKind} in (${sql.raw(inList(WHATSAPP_COMMAND_DOCUMENT_KINDS))})`,
    ),
    check(
      'whatsapp_command_documents_status_check',
      sql`${table.status} in (${sql.raw(inList(WHATSAPP_COMMAND_DOCUMENT_STATUSES))})`,
    ),
    /** O Postgres recusa repetição acima de 255 (`{16,256}`): o comprimento vai num `length` à parte. */
    check(
      'whatsapp_command_documents_idempotency_key_check',
      sql`${table.idempotencyKey} ~ '^[A-Za-z0-9._:-]+$' and length(${table.idempotencyKey}) between ${sql.raw(String(WHATSAPP_COMMAND_IDEMPOTENCY_KEY_LENGTH.min))} and ${sql.raw(String(WHATSAPP_COMMAND_IDEMPOTENCY_KEY_LENGTH.max))}`,
    ),
    check(
      'whatsapp_command_documents_document_id_check',
      sql`${table.status} not in (${sql.raw(inList(DOCUMENT_BEARING_STATUSES))}) or ${table.documentId} is not null`,
    ),
  ],
)
