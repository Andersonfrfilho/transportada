/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API (spec 143) — migrations só rodam lá. Só o que o trilho
 * `contractor-mail-outbound.v1` lê e escreve está declarado aqui: o outbox de saída inteiro, e das
 * outras três tabelas apenas as colunas que o envio de e-mail toca.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const contractorMailSettings = pgTable('contractor_mail_settings', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  secretEnvelope: jsonb('secret_envelope').notNull(),
  senderAddress: text('sender_address').notNull(),
  senderName: text('sender_name').notNull(),
  replyDomain: text('reply_domain').notNull(),
})

/**
 * Correção pós-entrega da T009: o consumidor não precisa mais desta tabela — o assunto vem gravado
 * na própria mensagem (`subject`), e o token de resposta é derivado de `(replyTokenSecret,
 * companyId, threadId)`, sem precisar ler `subject_type` nem nenhuma outra coluna da conversa.
 * `contractor_mail_threads` fica fora desta cópia por isso; se um trilho futuro precisar dela de
 * novo, é acrescentar aqui.
 */
export const contractorMailMessages = pgTable('contractor_mail_messages', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  threadId: uuid('thread_id').notNull(),
  direction: text().notNull(),
  subject: text().notNull(),
  toAddresses: text('to_addresses').array().notNull(),
  bodyText: text('body_text').notNull(),
  rfcMessageId: text('rfc_message_id'),
  providerEmailId: text('provider_email_id'),
  deliveryStatus: text('delivery_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contractorMailOutbox = pgTable('contractor_mail_outbox', {
  id: uuid().defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  messageId: uuid('message_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull().default(1n),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
