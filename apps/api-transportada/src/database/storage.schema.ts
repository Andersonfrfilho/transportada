/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { bigint, check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const STORAGE_OBJECT_STATUSES = ['staging', 'final', 'deleted'] as const
export type StorageObjectStatus = (typeof STORAGE_OBJECT_STATUSES)[number]

export const STORAGE_OBJECT_PURPOSES = ['import_source', 'nfe_document', 'nfe_event'] as const
export type StorageObjectPurpose = (typeof STORAGE_OBJECT_PURPOSES)[number]

export const storedObjects = pgTable(
  'stored_objects',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
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
  },
  (table) => [
    unique('stored_objects_company_id_id_unique').on(table.companyId, table.id),
    unique('stored_objects_company_provider_bucket_key_unique').on(
      table.companyId,
      table.provider,
      table.bucket,
      table.objectKey,
    ),
    index('stored_objects_company_status_lease_expires_idx').on(
      table.companyId,
      table.status,
      table.leaseExpiresAt,
    ),
    check('stored_objects_size_check', sql`${table.sizeBytes} >= 0`),
    check('stored_objects_sha256_check', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check('stored_objects_status_check', sql`${table.status} in ('staging', 'final', 'deleted')`),
    check(
      'stored_objects_purpose_check',
      sql`${table.purpose} in ('import_source', 'nfe_document', 'nfe_event')`,
    ),
    check(
      'stored_objects_lease_check',
      sql`(${table.leaseOwner} is null) = (${table.leaseExpiresAt} is null)`,
    ),
    check(
      'stored_objects_deleted_check',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} is not null)`,
    ),
    check(
      'stored_objects_final_lease_check',
      sql`${table.status} <> 'final' or (${table.leaseOwner} is null and ${table.leaseExpiresAt} is null)`,
    ),
  ],
)
