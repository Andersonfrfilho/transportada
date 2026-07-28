/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Schema copy of the API digital_certificates table (read). The cron pre-filters
 * companies to those with an active, in-window certificate before enqueuing a
 * pull. secret_envelope is intentionally never selected by the cron — it only
 * needs status + validity range. Parity with
 * apps/api-transportada/src/database/digital-certificate.schema.ts.
 */
import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const CERTIFICATE_PURPOSES = ['cte'] as const
export type CertificatePurpose = (typeof CERTIFICATE_PURPOSES)[number]

export const CERTIFICATE_STATUSES = ['active', 'retired'] as const
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number]

export const digitalCertificates = pgTable('digital_certificates', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  purpose: text().$type<CertificatePurpose>().notNull().default('cte'),
  version: bigint({ mode: 'bigint' }).notNull(),
  status: text().$type<CertificateStatus>().notNull(),
  validatedCnpj: text('validated_cnpj').notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  fingerprint: text().notNull(),
  createdByUserId: uuid('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
