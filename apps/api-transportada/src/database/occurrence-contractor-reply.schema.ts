/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: the contractor's answer to an occurrence (one row per occurrence), what was delivered to
 * whom (one row per target and attempt) and the append-only history of its transitions. Every
 * reference carries `company_id`. The reply points at the occurrence with `RESTRICT`: the events are
 * append-only, so a cascade would collide with the trigger.
 *
 * `mail_message_id` on the deliveries is a plain column without a foreign key: a contractor mail
 * message requires a thread, and the e-mail forwarding decides that in Phase 4.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CONTRACTOR_REPLY_ACTOR_KINDS,
  CONTRACTOR_REPLY_DELIVERY_REASONS,
  CONTRACTOR_REPLY_DELIVERY_STATUSES,
  CONTRACTOR_REPLY_DELIVERY_TARGETS,
  CONTRACTOR_REPLY_DELIVERY_FALLBACK_SOURCES,
  CONTRACTOR_REPLY_DELIVERY_TRIGGERS,
  CONTRACTOR_REPLY_EMAIL_ADDRESS_MAX_LENGTH,
  CONTRACTOR_REPLY_EMAIL_TARGETS,
  CONTRACTOR_REPLY_EVENT_REASONS,
  CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH,
  CONTRACTOR_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH,
  CONTRACTOR_REPLY_REASONS,
  CONTRACTOR_REPLY_STATUSES,
  CONTRACTOR_REPLY_WAITING_STATUSES,
  CONTRACTOR_REPLY_WHATSAPP_TARGET,
  type ContractorReplyActorKind,
  type ContractorReplyDeliveryReason,
  type ContractorReplyDeliveryStatus,
  type ContractorReplyDeliveryTarget,
  type ContractorReplyDeliveryTrigger,
  type ContractorReplyFallbackFrom,
  type ContractorReplyReason,
  type ContractorReplyStatus,
} from '../shared/occurrence-contractor-reply.constant.js'
import { DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN } from '../shared/delivery-client-email.constant.js'
import { companies, identityUsers } from './identity.schema.js'
import {
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversations,
} from './occurrence-conversation.schema.js'
import { inList } from './schema-check.constant.js'
import { tripDocumentOccurrences } from './trip.schema.js'

const raw = sql.raw
/** Spec 278 D1: the history event also records the outcome of the boleto check (event-only reasons). */
const DELIVERY_AND_REPLY_REASONS = [
  ...CONTRACTOR_REPLY_REASONS,
  ...CONTRACTOR_REPLY_DELIVERY_REASONS,
  ...CONTRACTOR_REPLY_EVENT_REASONS,
] as const

export const occurrenceContractorReplies = pgTable(
  'occurrence_contractor_replies',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceId: uuid('occurrence_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    /** The validated copy of the effective configuration, versioned and immutable. */
    config: jsonb().$type<Record<string, unknown>>().notNull(),
    status: varchar({ length: 24 }).$type<ContractorReplyStatus>().notNull(),
    reason: varchar({ length: 40 }).$type<ContractorReplyReason>(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    alertCount: smallint('alert_count').notNull().default(0),
    lastAlertAt: timestamp('last_alert_at', { withTimezone: true }),
    replyMessageId: uuid('reply_message_id'),
    replyAttachmentId: uuid('reply_attachment_id'),
    handledByUserId: uuid('handled_by_user_id'),
    handledNote: text('handled_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('occurrence_contractor_replies_company_id_id_unique').on(table.companyId, table.id),
    unique('occurrence_contractor_replies_company_occurrence_unique').on(
      table.companyId,
      table.occurrenceId,
    ),
    index('occurrence_contractor_replies_waiting_deadline_idx')
      .on(table.companyId, table.deadlineAt)
      .where(sql`${table.status} in (${raw(inList(CONTRACTOR_REPLY_WAITING_STATUSES))})`),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_contractor_replies_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.occurrenceId],
      foreignColumns: [tripDocumentOccurrences.companyId, tripDocumentOccurrences.id],
      name: 'occurrence_contractor_replies_occurrence_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.conversationId],
      foreignColumns: [occurrenceConversations.companyId, occurrenceConversations.id],
      name: 'occurrence_contractor_replies_conversation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.replyMessageId],
      foreignColumns: [occurrenceConversationMessages.companyId, occurrenceConversationMessages.id],
      name: 'occurrence_contractor_replies_reply_message_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.replyAttachmentId],
      foreignColumns: [
        occurrenceConversationAttachments.companyId,
        occurrenceConversationAttachments.id,
      ],
      name: 'occurrence_contractor_replies_reply_attachment_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.handledByUserId],
      foreignColumns: [identityUsers.id],
      name: 'occurrence_contractor_replies_handled_by_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'occurrence_contractor_replies_status_check',
      sql`${table.status} in (${raw(inList(CONTRACTOR_REPLY_STATUSES))})`,
    ),
    check(
      'occurrence_contractor_replies_reason_check',
      sql`${table.reason} is null or (${table.status} = 'needs_operator' and ${table.reason} in (${raw(inList(CONTRACTOR_REPLY_REASONS))}))`,
    ),
    check(
      'occurrence_contractor_replies_config_check',
      sql`jsonb_typeof(${table.config}) = 'object' and jsonb_exists(${table.config}, 'version')`,
    ),
    check('occurrence_contractor_replies_alert_count_check', sql`${table.alertCount} >= 0`),
    check(
      'occurrence_contractor_replies_handled_note_check',
      sql`${table.handledNote} is null or char_length(${table.handledNote}) between 1 and ${raw(String(CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH))}`,
    ),
    check(
      'occurrence_contractor_replies_handled_shape_check',
      sql`(${table.status} = 'handled') = (${table.handledByUserId} is not null and ${table.handledNote} is not null)
        and (${table.handledByUserId} is not null) = (${table.handledNote} is not null)`,
    ),
  ],
)

export const occurrenceContractorReplyDeliveries = pgTable(
  'occurrence_contractor_reply_deliveries',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    replyId: uuid('reply_id').notNull(),
    target: varchar({ length: 32 }).$type<ContractorReplyDeliveryTarget>().notNull(),
    trigger: varchar({ length: 16 }).$type<ContractorReplyDeliveryTrigger>().notNull(),
    status: varchar({ length: 24 }).$type<ContractorReplyDeliveryStatus>().notNull(),
    reason: varchar({ length: 40 }).$type<ContractorReplyDeliveryReason>(),
    /** Only on e-mail targets. Personal data: never in a log (retention note in spec 248 T7.3). */
    address: text(),
    attachmentId: uuid('attachment_id').notNull(),
    driverMessageId: uuid('driver_message_id'),
    /** No foreign key: a contractor mail message requires a thread; decided in Phase 4 (T4.7). */
    mailMessageId: uuid('mail_message_id'),
    actorUserId: uuid('actor_user_id'),
    /**
     * Spec 281 T5: o id da mensagem no provedor (o `key.id` do Evolution), só no alvo `client_boleto_whatsapp` que saiu.
     * É por ele que o webhook (T6) acha a entrega; único por empresa.
     */
    providerMessageId: text('provider_message_id'),
    idempotencyKey: varchar('idempotency_key', {
      length: CONTRACTOR_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /**
     * Spec 286 T3 (RF3): quem tomou para si a entrega automática por WhatsApp (`queued`), antes de chamar o Evolution.
     * O `update … where claimed_at is null` é a trava: duas chamadas ao despacho nunca mandam o mesmo boleto duas vezes.
     */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /**
     * Spec 286 (RF4): `whatsapp` quando o e-mail ao cliente saiu como queda do WhatsApp automático que não mandou;
     * o painel mostra "reserva do WhatsApp". Só no alvo `client_boleto_emails`.
     */
    fallbackFrom: varchar('fallback_from', { length: 16 }).$type<
      Exclude<ContractorReplyFallbackFrom, null>
    >(),
  },
  (table) => [
    unique('occurrence_contractor_reply_deliveries_company_id_id_unique').on(
      table.companyId,
      table.id,
    ),
    unique('occurrence_contractor_reply_deliveries_idempotency_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    uniqueIndex('occurrence_contractor_reply_deliveries_provider_message_unique')
      .on(table.companyId, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    index('occurrence_contractor_reply_deliveries_reply_idx').on(table.companyId, table.replyId),
    index('occurrence_contractor_reply_deliveries_pending_window_idx')
      .on(table.companyId, table.status)
      .where(sql`${table.status} = 'pending_window'`),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_contractor_reply_deliveries_company_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.replyId],
      foreignColumns: [occurrenceContractorReplies.companyId, occurrenceContractorReplies.id],
      name: 'occurrence_contractor_reply_deliveries_reply_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attachmentId],
      foreignColumns: [
        occurrenceConversationAttachments.companyId,
        occurrenceConversationAttachments.id,
      ],
      name: 'occurrence_contractor_reply_deliveries_attachment_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverMessageId],
      foreignColumns: [occurrenceConversationMessages.companyId, occurrenceConversationMessages.id],
      name: 'occurrence_contractor_reply_deliveries_driver_message_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [identityUsers.id],
      name: 'occurrence_contractor_reply_deliveries_actor_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'occurrence_contractor_reply_deliveries_target_check',
      sql`${table.target} in (${raw(inList(CONTRACTOR_REPLY_DELIVERY_TARGETS))})`,
    ),
    check(
      'occurrence_contractor_reply_deliveries_trigger_check',
      sql`${table.trigger} in (${raw(inList(CONTRACTOR_REPLY_DELIVERY_TRIGGERS))})`,
    ),
    check(
      'occurrence_contractor_reply_deliveries_status_check',
      sql`${table.status} in (${raw(inList(CONTRACTOR_REPLY_DELIVERY_STATUSES))})`,
    ),
    check(
      'occurrence_contractor_reply_deliveries_reason_check',
      sql`${table.reason} in (${raw(inList(CONTRACTOR_REPLY_DELIVERY_REASONS))})`,
    ),
    check(
      'occurrence_contractor_reply_deliveries_address_check',
      sql`${table.address} is null or (${table.target} in (${raw(inList(CONTRACTOR_REPLY_EMAIL_TARGETS))}) and char_length(${table.address}) between 1 and ${raw(String(CONTRACTOR_REPLY_EMAIL_ADDRESS_MAX_LENGTH))}) or (${table.target} = ${raw(`'${CONTRACTOR_REPLY_WHATSAPP_TARGET}'`)} and ${table.address} ~ ${raw(`'${DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN}'`)})`,
    ),
    /** Spec 281 T5: o id do provedor só existe no envio por WhatsApp. */
    check(
      'occurrence_contractor_reply_deliveries_provider_message_check',
      sql`${table.providerMessageId} is null or (${table.target} = ${raw(`'${CONTRACTOR_REPLY_WHATSAPP_TARGET}'`)} and char_length(${table.providerMessageId}) between 1 and 200)`,
    ),
    check(
      'occurrence_contractor_reply_deliveries_sent_at_check',
      sql`(${table.status} = 'sent') = (${table.sentAt} is not null)`,
    ),
    check(
      'occurrence_contractor_reply_deliveries_fallback_from_check',
      sql`${table.fallbackFrom} is null or (${table.fallbackFrom} in (${raw(inList(CONTRACTOR_REPLY_DELIVERY_FALLBACK_SOURCES))}) and ${table.target} = 'client_boleto_emails')`,
    ),
    check(
      'occurrence_contractor_reply_deliveries_actor_check',
      sql`(${table.trigger} = 'operator') = (${table.actorUserId} is not null)`,
    ),
    check(
      'occurrence_contractor_reply_deliveries_idempotency_key_check',
      sql`char_length(${table.idempotencyKey}) >= 1`,
    ),
  ],
)

/** Append-only by trigger (the mold of `trip_document_link_events`): no UPDATE, no DELETE. */
export const occurrenceContractorReplyEvents = pgTable(
  'occurrence_contractor_reply_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    replyId: uuid('reply_id').notNull(),
    deliveryId: uuid('delivery_id'),
    fromStatus: varchar('from_status', { length: 24 }).$type<ContractorReplyStatus>(),
    toStatus: varchar('to_status', { length: 24 }).$type<ContractorReplyStatus>().notNull(),
    reason: varchar({ length: 40 }),
    actorKind: varchar('actor_kind', { length: 16 }).$type<ContractorReplyActorKind>().notNull(),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('occurrence_contractor_reply_events_company_reply_created_at_idx').on(
      table.companyId,
      table.replyId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_contractor_reply_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.replyId],
      foreignColumns: [occurrenceContractorReplies.companyId, occurrenceContractorReplies.id],
      name: 'occurrence_contractor_reply_events_reply_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.deliveryId],
      foreignColumns: [
        occurrenceContractorReplyDeliveries.companyId,
        occurrenceContractorReplyDeliveries.id,
      ],
      name: 'occurrence_contractor_reply_events_delivery_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [identityUsers.id],
      name: 'occurrence_contractor_reply_events_actor_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'occurrence_contractor_reply_events_from_status_check',
      sql`${table.fromStatus} in (${raw(inList(CONTRACTOR_REPLY_STATUSES))})`,
    ),
    check(
      'occurrence_contractor_reply_events_to_status_check',
      sql`${table.toStatus} in (${raw(inList(CONTRACTOR_REPLY_STATUSES))})`,
    ),
    check(
      'occurrence_contractor_reply_events_reason_check',
      sql`${table.reason} in (${raw(inList(DELIVERY_AND_REPLY_REASONS))})`,
    ),
    check(
      'occurrence_contractor_reply_events_actor_kind_check',
      sql`${table.actorKind} in (${raw(inList(CONTRACTOR_REPLY_ACTOR_KINDS))})`,
    ),
    check(
      'occurrence_contractor_reply_events_actor_check',
      sql`(${table.actorKind} = 'system') = (${table.actorUserId} is null)`,
    ),
  ],
)
