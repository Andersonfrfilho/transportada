/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `storage.schema.ts` da API. O worker é quem **apaga** o objeto vencido
 * (`trip.occurrence-attachment.purge`), por isso a cópia carrega todas as colunas — mas nenhuma
 * constraint: quem faz migration é a API, e os CHECKs de status/purpose/lease são dela.
 * `test/trip-occurrence-attachment-purge/schema-parity.contract.ts` reprova se as colunas divergirem.
 */
import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export type StorageObjectStatus = 'staging' | 'final' | 'deleted'
export type StorageObjectPurpose = string

export const storedObjects = pgTable('stored_objects', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  provider: text().notNull(),
  bucket: text().notNull(),
  objectKey: text('object_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  sha256: text().notNull(),
  status: text().$type<StorageObjectStatus>().notNull(),
  purpose: text().$type<StorageObjectPurpose>().notNull(),
  retentionUntil: timestamp('retention_until', { withTimezone: true }),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
