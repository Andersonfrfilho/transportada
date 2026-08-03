/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { bigint, check, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import {
  CTE_RETRY_BACKOFF_STEPS_LIMIT,
  CTE_RETRY_DEFAULT_BACKOFF_SECONDS,
  CTE_RETRY_DEFAULT_MAX_ATTEMPTS,
  CTE_RETRY_MAX_ATTEMPTS_LIMIT,
} from '../cte-issuance/domain/cte-retry.policy.js'
import { companies } from './identity.schema.js'
import type { MdfeInsuranceResponsibility } from './mdfe.schema.js'

export const FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type FiscalEnvironment = (typeof FISCAL_ENVIRONMENTS)[number]

export const BILLING_OBSERVATIONS_MAX_LENGTH = 500

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
    mdfeInsuranceResponsibility: text('mdfe_insurance_responsibility')
      .$type<MdfeInsuranceResponsibility | ''>()
      .notNull()
      .default(''),
    mdfeInsurerName: text('mdfe_insurer_name').notNull().default(''),
    mdfeInsurerTaxId: text('mdfe_insurer_tax_id').notNull().default(''),
    mdfeInsurancePolicy: text('mdfe_insurance_policy').notNull().default(''),
    mdfePaymentBankCode: text('mdfe_payment_bank_code').notNull().default(''),
    mdfePaymentBankBranch: text('mdfe_payment_bank_branch').notNull().default(''),
    mdfePaymentPixKey: text('mdfe_payment_pix_key').notNull().default(''),
    billingBankName: text('billing_bank_name').notNull().default(''),
    billingBankCode: text('billing_bank_code').notNull().default(''),
    billingBankBranch: text('billing_bank_branch').notNull().default(''),
    billingBankAccount: text('billing_bank_account').notNull().default(''),
    billingPixKey: text('billing_pix_key').notNull().default(''),
    billingObservations: text('billing_observations').notNull().default(''),
    cteRetryMaxAttempts: integer('cte_retry_max_attempts')
      .notNull()
      .default(CTE_RETRY_DEFAULT_MAX_ATTEMPTS),
    cteRetryBackoffSeconds: integer('cte_retry_backoff_seconds')
      .array()
      .notNull()
      .default([...CTE_RETRY_DEFAULT_BACKOFF_SECONDS]),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('company_fiscal_profiles_cnpj_unique').on(table.cnpj),
    check(
      'company_fiscal_profiles_billing_bank_code_check',
      sql`length(${table.billingBankCode}) = 0 or ${table.billingBankCode} ~ '^[0-9]{3}$'`,
    ),
    check(
      'company_fiscal_profiles_billing_bank_branch_check',
      sql`length(${table.billingBankBranch}) = 0 or ${table.billingBankBranch} ~ '^[0-9]{1,10}$'`,
    ),
    check(
      'company_fiscal_profiles_billing_observations_check',
      sql`length(${table.billingObservations}) <= ${sql.raw(String(BILLING_OBSERVATIONS_MAX_LENGTH))}`,
    ),
    check('company_fiscal_profiles_cnpj_check', sql`${table.cnpj} ~ '^[0-9]{14}$'`),
    check(
      'company_fiscal_profiles_cte_retry_backoff_check',
      sql`array_length(${table.cteRetryBackoffSeconds}, 1) between 1 and ${sql.raw(String(CTE_RETRY_BACKOFF_STEPS_LIMIT))} and 0 < all(${table.cteRetryBackoffSeconds})`,
    ),
    check(
      'company_fiscal_profiles_cte_retry_max_attempts_check',
      sql`${table.cteRetryMaxAttempts} between 1 and ${sql.raw(String(CTE_RETRY_MAX_ATTEMPTS_LIMIT))}`,
    ),
    check(
      'company_fiscal_profiles_environment_check',
      sql`${table.environment} in ('homologation', 'production')`,
    ),
    check(
      'company_fiscal_profiles_mdfe_insurance_responsibility_check',
      sql`length(${table.mdfeInsuranceResponsibility}) = 0 or ${table.mdfeInsuranceResponsibility} in ('1', '2')`,
    ),
    check(
      'company_fiscal_profiles_mdfe_insurer_tax_id_check',
      sql`length(${table.mdfeInsurerTaxId}) = 0 or ${table.mdfeInsurerTaxId} ~ '^[0-9]{11}$|^[0-9]{14}$'`,
    ),
    check('company_fiscal_profiles_tax_regime_check', sql`${table.taxRegime} in ('1', '2', '3')`),
    check('company_fiscal_profiles_version_check', sql`${table.version} > 0`),
  ],
)
