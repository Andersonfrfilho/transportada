/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API — migrations só rodam lá. Mudou a tabela do outro lado, mude
 * aqui. Só o que este worker lê e escreve está declarado: os outbox inteiros, e do anexo apenas as
 * colunas que a extração toca.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * A mesma forma serve às duas filas de leitura de anexo — a da candidatura e a da ficha do motorista
 * (spec 091). Só o nome da tabela e a FK para o anexo mudam, e as FKs moram nas migrations da API.
 */
function createAttachmentOutboxTable(name: string) {
  return pgTable(name, {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    attachmentId: uuid('attachment_id').notNull(),
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
}

export const aggregateAttachmentOutbox = createAttachmentOutboxTable('aggregate_attachment_outbox')

export const fleetDriverAttachmentOutbox = createAttachmentOutboxTable(
  'fleet_driver_attachment_outbox',
)

export const aggregateApplicationAttachments = pgTable('aggregate_application_attachments', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  type: text().notNull(),
  extractedFields: jsonb('extracted_fields'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const fleetDriverAttachments = pgTable('fleet_driver_attachments', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  type: text().notNull(),
  extractedFields: jsonb('extracted_fields'),
  extractedAt: timestamp('extracted_at', { withTimezone: true }),
  decision: text(),
})
