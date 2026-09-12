/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API (`whatsapp-command.schema.ts`), **só as colunas que a
 * liquidação lê**. As duas apps não importam código uma da outra, e quem faz migration é a API —
 * aqui não há CHECK, FK nem unique declarados, porque nada disso é criado a partir deste arquivo.
 */
import { date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const whatsAppCommandRequests = pgTable('whatsapp_command_requests', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  status: text().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
})

export const whatsAppCommandDocuments = pgTable('whatsapp_command_documents', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  requestId: uuid('request_id').notNull(),
  documentKind: text('document_kind').notNull(),
  status: text().notNull(),
  documentId: uuid('document_id'),
})
