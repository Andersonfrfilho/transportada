/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API (spec 183 T401) — migrations só rodam lá. Só o que o trilho de
 * e-mail toca: a mensagem da conversa, para gravar a resposta da contratante e aplicar o status do
 * Resend (T405) — e, desde a T702c1, o anexo que vem no e-mail. Os CHECKs e as FKs moram no banco;
 * aqui ficam as listas que a política precisa.
 */
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const OCCURRENCE_CONVERSATION_CHANNELS = ['email', 'whatsapp', 'app', 'portal'] as const
export type OccurrenceConversationChannel = (typeof OCCURRENCE_CONVERSATION_CHANNELS)[number]

export const OCCURRENCE_CONVERSATION_MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'bounced',
] as const
export type OccurrenceConversationMessageStatus =
  (typeof OCCURRENCE_CONVERSATION_MESSAGE_STATUSES)[number]

/** O teto do corpo na conversa (CHECK `occurrence_conversation_messages_body_length_check`). */
export const OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH = 8000

export const occurrenceConversationMessages = pgTable('occurrence_conversation_messages', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  channel: text().$type<OccurrenceConversationChannel>().notNull(),
  direction: text().notNull(),
  senderAddress: text('sender_address'),
  bodyText: text('body_text').notNull().default(''),
  status: text().$type<OccurrenceConversationMessageStatus>(),
  statusTimes: jsonb('status_times').$type<Record<string, string>>().notNull().default({}),
  mailMessageId: uuid('mail_message_id'),
  providerMessageId: text('provider_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Spec 183 T702c1: o anexo do e-mail recebido, ligado à mensagem da conversa. */
export const occurrenceConversationAttachments = pgTable('occurrence_conversation_attachments', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  messageId: uuid('message_id').notNull(),
  storedObjectId: uuid('stored_object_id').notNull(),
  sha256: text().notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  contentType: text('content_type').notNull(),
  fileName: text('file_name').notNull().default(''),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Spec 183 T702c2: o pedido de upload do anexo — o worker expira o `pending` vencido. */
export type OccurrenceConversationUploadStatus = 'pending' | 'attached' | 'expired'

export const occurrenceConversationUploads = pgTable('occurrence_conversation_uploads', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  bucket: text().notNull(),
  objectKey: text('object_key').notNull(),
  status: text().$type<OccurrenceConversationUploadStatus>().notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
