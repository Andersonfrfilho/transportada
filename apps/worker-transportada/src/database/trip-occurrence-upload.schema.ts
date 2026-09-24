/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `trip_occurrence_uploads` (`trip.schema.ts` da API, spec 179 T201). O worker
 * é quem **expira** o pedido de upload vencido (achado [3] da revisão de código de 23/09, spec 179):
 * apaga o objeto do bucket quando existir e marca `status = 'expired'` — por isso a cópia carrega as
 * colunas que a rotina lê e grava, sem nenhuma constraint: quem migra é a API.
 * `test/trip-occurrence-upload-expire/schema-parity.contract.ts` reprova se as colunas divergirem.
 */
import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export type TripOccurrenceUploadStatus = 'pending' | 'confirmed' | 'expired'

export const tripOccurrenceUploads = pgTable('trip_occurrence_uploads', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  tripId: uuid('trip_id').notNull(),
  driverId: uuid('driver_id').notNull(),
  bucket: text().notNull(),
  objectKey: text('object_key').notNull(),
  mimeType: text('mime_type').notNull(),
  declaredSizeBytes: bigint('declared_size_bytes', { mode: 'bigint' }).notNull(),
  status: text().$type<TripOccurrenceUploadStatus>().notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
