/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const companyFiscalProfiles = pgTable('company_fiscal_profiles', {
  companyId: uuid('company_id').primaryKey(),
  legalName: text('legal_name').notNull(),
  cnpj: text().notNull(),
  stateRegistration: text('state_registration').notNull(),
  taxRegime: text('tax_regime').notNull(),
  rntrc: text().notNull(),
  street: text().notNull(),
  number: text().notNull(),
  district: text().notNull(),
  city: text().notNull(),
  state: text().notNull(),
  postalCode: text('postal_code').notNull(),
  cityIbgeCode: text('city_ibge_code').notNull(),
  environment: text().notNull(),
})

export const fiscalSequences = pgTable('fiscal_sequences', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  environment: text().notNull(),
  model: text().notNull(),
  series: bigint({ mode: 'bigint' }).notNull(),
  nextNumber: bigint('next_number', { mode: 'bigint' }).notNull(),
  version: bigint({ mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const digitalCertificates = pgTable('digital_certificates', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  purpose: text().notNull(),
  version: bigint({ mode: 'bigint' }).notNull(),
  status: text().notNull(),
  secretEnvelope: jsonb('secret_envelope'),
  validatedCnpj: text('validated_cnpj').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
