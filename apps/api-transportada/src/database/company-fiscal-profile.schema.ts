/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { bigint, check, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type FiscalEnvironment = (typeof FISCAL_ENVIRONMENTS)[number]

export const TAX_REGIMES = ['1', '2', '3'] as const
export type TaxRegime = (typeof TAX_REGIMES)[number]

export const companyFiscalProfiles = pgTable(
  'company_fiscal_profiles',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name').notNull(),
    cnpj: text().notNull(),
    stateRegistration: text('state_registration').notNull(),
    municipalRegistration: text('municipal_registration').notNull(),
    taxRegime: text('tax_regime').$type<TaxRegime>().notNull(),
    rntrc: text().notNull(),
    street: text().notNull(),
    number: text().notNull(),
    complement: text().notNull(),
    district: text().notNull(),
    city: text().notNull(),
    state: text().notNull(),
    postalCode: text('postal_code').notNull(),
    cityIbgeCode: text('city_ibge_code').notNull(),
    phone: text().notNull(),
    email: text().notNull(),
    environment: text().$type<FiscalEnvironment>().notNull().default('homologation'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('company_fiscal_profiles_cnpj_unique').on(table.cnpj),
    check('company_fiscal_profiles_cnpj_check', sql`${table.cnpj} ~ '^[0-9]{14}$'`),
    check(
      'company_fiscal_profiles_environment_check',
      sql`${table.environment} in ('homologation', 'production')`,
    ),
    check('company_fiscal_profiles_tax_regime_check', sql`${table.taxRegime} in ('1', '2', '3')`),
    check('company_fiscal_profiles_version_check', sql`${table.version} > 0`),
  ],
)
