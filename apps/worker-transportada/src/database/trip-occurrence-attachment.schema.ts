/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `trip_document_occurrence_attachments` (`trip.schema.ts` da API). O worker
 * é quem **remove** a linha no expurgo (RF21), por isso a cópia carrega todas as colunas — mas
 * nenhuma constraint: quem faz migration é a API, e os CHECKs/FKs de posição e objeto são dela.
 * `test/trip-occurrence-attachment-purge/schema-parity.contract.ts` reprova se as colunas divergirem.
 */
import { pgTable, smallint, timestamp, uuid } from 'drizzle-orm/pg-core'

export const tripOccurrenceAttachments = pgTable('trip_document_occurrence_attachments', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  occurrenceId: uuid('occurrence_id').notNull(),
  storedObjectId: uuid('stored_object_id').notNull(),
  thumbnailObjectId: uuid('thumbnail_object_id'),
  position: smallint().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
