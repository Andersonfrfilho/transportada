/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, identityUsers } from './identity.schema.js'

export const CERTIFICATE_PURPOSES = ['cte'] as const
export type CertificatePurpose = (typeof CERTIFICATE_PURPOSES)[number]

export const CERTIFICATE_STATUSES = ['active', 'retired'] as const
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number]

export const digitalCertificates = pgTable(
  'digital_certificates',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    purpose: text().$type<CertificatePurpose>().notNull().default('cte'),
    version: bigint({ mode: 'bigint' }).notNull(),
    status: text().$type<CertificateStatus>().notNull(),
    secretEnvelope: jsonb('secret_envelope'),
    validatedCnpj: text('validated_cnpj').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    fingerprint: text().notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => identityUsers.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('digital_certificates_company_id_purpose_version_unique').on(
      table.companyId,
      table.purpose,
      table.version,
    ),
    unique('digital_certificates_company_id_id_unique').on(table.companyId, table.id),
    uniqueIndex('digital_certificates_company_id_purpose_active_unique')
      .on(table.companyId, table.purpose)
      .where(sql`${table.status} = 'active'`),
    index('digital_certificates_company_id_created_at_id_idx').on(
      table.companyId,
      table.createdAt,
      table.id,
    ),
    check('digital_certificates_purpose_check', sql`${table.purpose} = 'cte'`),
    check('digital_certificates_status_check', sql`${table.status} in ('active', 'retired')`),
    check('digital_certificates_version_check', sql`${table.version} > 0`),
    check(
      'digital_certificates_envelope_status_check',
      sql`(${table.status} = 'active' and ${table.secretEnvelope} is not null) or (${table.status} = 'retired' and ${table.secretEnvelope} is null)`,
    ),
    check('digital_certificates_validated_cnpj_check', sql`${table.validatedCnpj} ~ '^[0-9]{14}$'`),
    check(
      'digital_certificates_validity_range_check',
      sql`${table.validFrom} < ${table.expiresAt}`,
    ),
  ],
)
