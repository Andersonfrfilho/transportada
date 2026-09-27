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
 * T010 (spec 143): o trilho de entrada precisa achar a conversa pelo hash do token de resposta,
 * amarrado ao `company_id` (plan.md § Segurança e tenant) — é só isso que ele lê daqui.
 */
export const contractorMailThreads = pgTable('contractor_mail_threads', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  replyTokenHash: text('reply_token_hash').notNull(),
})

/**
 * Correção pós-entrega da T009: o consumidor de saída não precisa desta tabela para nada — o
 * assunto vem gravado na própria mensagem (`subject`), e o token de resposta é derivado de
 * `(replyTokenSecret, companyId, threadId)`. T010 reintroduziu `contractorMailThreads` acima, só
 * para o trilho de **entrada**, que precisa achar a conversa pelo hash do token.
 *
 * As colunas de `inbound` (T010) entram aqui: `fromAddress`, `inReplyTo`, `rawObjectId`,
 * `rawSha256` e `dkimResult` — nenhuma delas é lida ou escrita pelo trilho de saída.
 */
export const contractorMailMessages = pgTable('contractor_mail_messages', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  threadId: uuid('thread_id').notNull(),
  direction: text().notNull(),
  fromAddress: text('from_address'),
  fromDisplayName: text('from_display_name'),
  subject: text().notNull(),
  toAddresses: text('to_addresses').array().notNull(),
  bodyText: text('body_text').notNull(),
  bodyHtml: text('body_html'),
  rawObjectId: uuid('raw_object_id'),
  rawSha256: text('raw_sha256'),
  rfcMessageId: text('rfc_message_id'),
  inReplyTo: text('in_reply_to'),
  dkimResult: text('dkim_result'),
  interpretation: text(),
  providerEmailId: text('provider_email_id'),
  deliveryStatus: text('delivery_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * T010: cópia por valor do outbox de entrada — o webhook (API) só grava a referência
 * (`providerEmailId`); é este trilho que busca o resto no Resend.
 */
export const contractorInboundEmailOutbox = pgTable('contractor_inbound_email_outbox', {
  id: uuid().defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  providerEmailId: text('provider_email_id').notNull(),
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
