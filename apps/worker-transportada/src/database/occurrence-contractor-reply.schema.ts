/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API (spec 248) — migrations só rodam lá. Só o que a resposta por
 * e-mail da contratante lê e escreve está declarado aqui: o retorno e o histórico das suas transições.
 */
import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import type {
  ContractorReplyReason,
  ContractorReplyStatus,
} from '../shared/occurrence-contractor-reply.constant.js'

export const occurrenceContractorReplies = pgTable('occurrence_contractor_replies', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  config: jsonb().$type<Record<string, unknown>>().notNull(),
  status: varchar({ length: 24 }).$type<ContractorReplyStatus>().notNull(),
  reason: varchar({ length: 40 }).$type<ContractorReplyReason>(),
  replyMessageId: uuid('reply_message_id'),
  replyAttachmentId: uuid('reply_attachment_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const occurrenceContractorReplyEvents = pgTable('occurrence_contractor_reply_events', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  replyId: uuid('reply_id').notNull(),
  fromStatus: varchar('from_status', { length: 24 }).$type<ContractorReplyStatus>(),
  toStatus: varchar('to_status', { length: 24 }).$type<ContractorReplyStatus>().notNull(),
  reason: varchar({ length: 40 }),
  actorKind: varchar('actor_kind', { length: 16 }).notNull(),
})
