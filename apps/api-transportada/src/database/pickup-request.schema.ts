/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  foreignKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { contractors } from './delivery-client.schema.js'
import { companies } from './identity.schema.js'

export const PICKUP_REQUEST_KINDS = ['pickup', 'delivery'] as const
export type PickupRequestKind = (typeof PICKUP_REQUEST_KINDS)[number]

export const PICKUP_REQUEST_STATUSES = [
  'requested',
  'accepted',
  'refused',
  'canceled',
  'expired',
  'scheduled',
  'done',
] as const
export type PickupRequestStatus = (typeof PICKUP_REQUEST_STATUSES)[number]

/** De onde o pedido veio. A porta de entrada muda; a fila e as regras são as mesmas (spec 339 D1). */
export const PICKUP_REQUEST_SOURCES = ['portal', 'public_quote', 'integration'] as const
export type PickupRequestSource = (typeof PICKUP_REQUEST_SOURCES)[number]

export type PickupRequestAddress = {
  readonly street: string
  readonly number: string
  readonly complement: string | null
  readonly district: string
  readonly city: string
  readonly cityIbgeCode: string
  readonly state: string
  readonly postalCode: string
}

/**
 * Spec 339: o pedido de coleta/entrega do cliente. É um registro próprio, **nunca uma viagem**:
 * aceitar gera só uma sugestão, e `trip_id`/`trip_stop_id` só são preenchidos quando o escritório
 * confirma o encaixe.
 *
 * ⚠️ `trip_id`/`trip_stop_id`/`decided_by_user_id` sem chave estrangeira de propósito: o pedido é
 * rastro comercial e sobrevive à viagem cancelada ou apagada pela poda da staging.
 */
export const pickupRequests = pgTable(
  'pickup_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    /** Nulo só no pedido anônimo (338): o contratante nasce na aceitação (D4). */
    contractorId: uuid('contractor_id').references(() => contractors.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    source: text().notNull().$type<PickupRequestSource>(),
    kind: text().notNull().$type<PickupRequestKind>(),
    status: text().notNull().$type<PickupRequestStatus>().default('requested'),
    /** Documento de quem pede, só dígitos. Para pedido anônimo é o que liga ao cadastro na aceitação. */
    requesterTaxId: text('requester_tax_id').notNull(),
    requesterName: text('requester_name').notNull(),
    requesterEmail: text('requester_email'),
    requesterPhone: text('requester_phone'),
    origin: jsonb().notNull().$type<PickupRequestAddress>(),
    destination: jsonb().notNull().$type<PickupRequestAddress>(),
    windowStart: date('window_start', { mode: 'string' }).notNull(),
    windowEnd: date('window_end', { mode: 'string' }).notNull(),
    cargoDescription: text('cargo_description').notNull(),
    volumes: integer().notNull(),
    weightKg: numeric('weight_kg', { precision: 12, scale: 3 }).notNull(),
    note: text(),
    /** Total que o cliente viu no orçamento (326/338), para registrar divergência da decisão. */
    quotedTotalAmount: numeric('quoted_total_amount', { precision: 19, scale: 4 }),
    quoteValidUntil: date('quote_valid_until', { mode: 'string' }),
    /** Chave de idempotência por origem: o mesmo envio repetido devolve o mesmo pedido. */
    idempotencyKey: text('idempotency_key').notNull(),
    decidedByUserId: uuid('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    acceptedWindowStart: date('accepted_window_start', { mode: 'string' }),
    acceptedWindowEnd: date('accepted_window_end', { mode: 'string' }),
    acceptedTotalAmount: numeric('accepted_total_amount', { precision: 19, scale: 4 }),
    tripId: uuid('trip_id'),
    tripStopId: uuid('trip_stop_id'),
    /** Spec 339 D9: sem decisão até aqui o cron expira o pedido. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** O alerta de "um dia útil sem resposta" sai uma vez só. */
    staleAlertedAt: timestamp('stale_alerted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('pickup_requests_company_source_idempotency_unique').on(
      table.companyId,
      table.source,
      table.idempotencyKey,
    ),
    index('pickup_requests_company_status_idx').on(table.companyId, table.status, table.createdAt),
    index('pickup_requests_company_contractor_idx').on(table.companyId, table.contractorId),
    index('pickup_requests_open_expiry_idx')
      .on(table.expiresAt)
      .where(sql`${table.status} = 'requested'`),
    check('pickup_requests_kind_check', sql`${table.kind} in ('pickup', 'delivery')`),
    check(
      'pickup_requests_status_check',
      sql`${table.status} in ('requested', 'accepted', 'refused', 'canceled', 'expired', 'scheduled', 'done')`,
    ),
    check(
      'pickup_requests_source_check',
      sql`${table.source} in ('portal', 'public_quote', 'integration')`,
    ),
    check('pickup_requests_window_check', sql`${table.windowEnd} >= ${table.windowStart}`),
    check('pickup_requests_cargo_check', sql`${table.volumes} > 0 and ${table.weightKg} > 0`),
    check(
      'pickup_requests_refusal_note_check',
      sql`${table.status} <> 'refused' or length(btrim(coalesce(${table.decisionNote}, ''))) > 0`,
    ),
    check(
      'pickup_requests_contractor_required_check',
      sql`${table.source} <> 'portal' or ${table.contractorId} is not null`,
    ),
  ],
)

export const PICKUP_NOTIFICATION_EVENTS = [
  'requested',
  'accepted',
  'refused',
  'scheduled',
  'canceled',
  'expired',
  'stale',
] as const
export type PickupNotificationEvent = (typeof PICKUP_NOTIFICATION_EVENTS)[number]
export const PICKUP_NOTIFICATION_AUDIENCES = ['client', 'office'] as const
export type PickupNotificationAudience = (typeof PICKUP_NOTIFICATION_AUDIENCES)[number]
export const PICKUP_NOTIFICATION_CHANNELS = ['email', 'whatsapp'] as const
export type PickupNotificationChannel = (typeof PICKUP_NOTIFICATION_CHANNELS)[number]
export const PICKUP_NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const
export type PickupNotificationStatus = (typeof PICKUP_NOTIFICATION_STATUSES)[number]

/**
 * Spec 339 T4 (e 340): caixa de saída dos avisos do pedido. A API só grava a linha, na mesma transação da mudança de
 * estado; quem entrega (e-mail e WhatsApp) é o worker, em lote, com tentativas. Assim uma rajada de pedidos nunca
 * faz a requisição esperar um provedor externo. A chave única impede o mesmo aviso duas vezes.
 */
export const pickupRequestNotifications = pgTable(
  'pickup_request_notifications',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    pickupRequestId: uuid('pickup_request_id').notNull(),
    event: text().notNull().$type<PickupNotificationEvent>(),
    audience: text().notNull().$type<PickupNotificationAudience>(),
    channel: text().notNull().$type<PickupNotificationChannel>(),
    status: text().notNull().$type<PickupNotificationStatus>().default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text('last_error'),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Nome explícito: o gerado passa de 63 caracteres e o Postgres o truncaria. */
    foreignKey({
      columns: [table.pickupRequestId],
      foreignColumns: [pickupRequests.id],
      name: 'pickup_request_notifications_request_id_fkey',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    uniqueIndex('pickup_request_notifications_unique').on(
      table.pickupRequestId,
      table.event,
      table.audience,
      table.channel,
    ),
    index('pickup_request_notifications_pending_idx')
      .on(table.availableAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      'pickup_request_notifications_event_check',
      sql`${table.event} in ('requested', 'accepted', 'refused', 'scheduled', 'canceled', 'expired', 'stale')`,
    ),
    check(
      'pickup_request_notifications_audience_check',
      sql`${table.audience} in ('client', 'office')`,
    ),
    check(
      'pickup_request_notifications_channel_check',
      sql`${table.channel} in ('email', 'whatsapp')`,
    ),
    check(
      'pickup_request_notifications_status_check',
      sql`${table.status} in ('pending', 'sent', 'failed', 'skipped')`,
    ),
  ],
)
