/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const COMPANY_LOGO_MIME_TYPES = ['image/jpeg', 'image/png'] as const
export type CompanyLogoMimeType = (typeof COMPANY_LOGO_MIME_TYPES)[number]

/** 256 KiB cobre qualquer marca em PNG/JPEG e mantém a linha longe do território de arquivo grande. */
export const COMPANY_LOGO_MAX_BYTES = 262_144

export const companyLogos = pgTable(
  'company_logos',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    mimeType: text('mime_type').$type<CompanyLogoMimeType>().notNull(),
    contentBase64: text('content_base64').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('company_logos_mime_type_check', sql`${table.mimeType} in ('image/jpeg', 'image/png')`),
    check(
      'company_logos_byte_size_check',
      sql`${table.byteSize} between 1 and ${sql.raw(String(COMPANY_LOGO_MAX_BYTES))}`,
    ),
    check('company_logos_sha256_check', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
)
