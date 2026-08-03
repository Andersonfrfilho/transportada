import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from './support.js'
import { companyFiscalProfiles } from './tables.js'

describe('tenant fiscal schema', () => {
  test('defines the complete fiscal profile without widening the identity company', () => {
    expect(columnNames(companyFiscalProfiles)).toEqual([
      'company_id',
      'legal_name',
      'trade_name',
      'cnpj',
      'state_registration',
      'municipal_registration',
      'tax_regime',
      'rntrc',
      'street',
      'number',
      'complement',
      'district',
      'city',
      'state',
      'postal_code',
      'city_ibge_code',
      'phone',
      'email',
      'environment',
      'mdfe_insurance_responsibility',
      'mdfe_insurer_name',
      'mdfe_insurer_tax_id',
      'mdfe_insurance_policy',
      'mdfe_payment_bank_code',
      'mdfe_payment_bank_branch',
      'mdfe_payment_pix_key',
      'billing_bank_name',
      'billing_bank_code',
      'billing_bank_branch',
      'billing_bank_account',
      'billing_pix_key',
      'billing_observations',
      'cte_retry_max_attempts',
      'cte_retry_backoff_seconds',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(companyFiscalProfiles)).toEqual(columnNames(companyFiscalProfiles))
    expect(columnSqlTypes(companyFiscalProfiles)).toEqual({
      company_id: 'uuid',
      legal_name: 'text',
      trade_name: 'text',
      cnpj: 'text',
      state_registration: 'text',
      municipal_registration: 'text',
      tax_regime: 'text',
      rntrc: 'text',
      street: 'text',
      number: 'text',
      complement: 'text',
      district: 'text',
      city: 'text',
      state: 'text',
      postal_code: 'text',
      city_ibge_code: 'text',
      phone: 'text',
      email: 'text',
      environment: 'text',
      mdfe_insurance_policy: 'text',
      mdfe_insurance_responsibility: 'text',
      mdfe_insurer_name: 'text',
      mdfe_insurer_tax_id: 'text',
      mdfe_payment_bank_branch: 'text',
      mdfe_payment_bank_code: 'text',
      mdfe_payment_pix_key: 'text',
      billing_bank_name: 'text',
      billing_bank_code: 'text',
      billing_bank_branch: 'text',
      billing_bank_account: 'text',
      billing_pix_key: 'text',
      billing_observations: 'text',
      cte_retry_max_attempts: 'integer',
      cte_retry_backoff_seconds: 'integer',
      version: 'bigint',
      created_at: 'timestamp with time zone',
      updated_at: 'timestamp with time zone',
    })

    const columns = getTableConfig(companyFiscalProfiles).columns
    const companyId = columns.find((column) => column.name === 'company_id')
    expect(companyId?.primary).toBeTrue()

    const retryBackoff = columns.find((column) => column.name === 'cte_retry_backoff_seconds')
    expect(retryBackoff?.dimensions).toBe(1)
    expect(retryBackoff?.default).toEqual([5, 30, 300])
    expect(columns.find((column) => column.name === 'cte_retry_max_attempts')?.default).toBe(3)
    expect(foreignKeys(companyFiscalProfiles)).toEqual([
      {
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: 'company_fiscal_profiles_company_id_companies_id_fk',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ])
    expect(uniqueColumnsByName(companyFiscalProfiles)).toEqual({
      company_fiscal_profiles_cnpj_unique: ['cnpj'],
    })
    expect(checkSqlByName(companyFiscalProfiles)).toEqual({
      company_fiscal_profiles_billing_bank_branch_check: `length("company_fiscal_profiles"."billing_bank_branch") = 0 or "company_fiscal_profiles"."billing_bank_branch" ~ '^[0-9]{1,10}$'`,
      company_fiscal_profiles_billing_bank_code_check: `length("company_fiscal_profiles"."billing_bank_code") = 0 or "company_fiscal_profiles"."billing_bank_code" ~ '^[0-9]{3}$'`,
      company_fiscal_profiles_billing_observations_check: `length("company_fiscal_profiles"."billing_observations") <= 500`,
      company_fiscal_profiles_cnpj_check: `"company_fiscal_profiles"."cnpj" ~ '^[0-9]{14}$'`,
      company_fiscal_profiles_cte_retry_backoff_check: `array_length("company_fiscal_profiles"."cte_retry_backoff_seconds", 1) between 1 and 10 and 0 < all("company_fiscal_profiles"."cte_retry_backoff_seconds")`,
      company_fiscal_profiles_cte_retry_max_attempts_check: `"company_fiscal_profiles"."cte_retry_max_attempts" between 1 and 10`,
      company_fiscal_profiles_environment_check: `"company_fiscal_profiles"."environment" in ('homologation', 'production')`,
      company_fiscal_profiles_mdfe_insurance_responsibility_check: `length("company_fiscal_profiles"."mdfe_insurance_responsibility") = 0 or "company_fiscal_profiles"."mdfe_insurance_responsibility" in ('1', '2')`,
      company_fiscal_profiles_mdfe_insurer_tax_id_check: `length("company_fiscal_profiles"."mdfe_insurer_tax_id") = 0 or "company_fiscal_profiles"."mdfe_insurer_tax_id" ~ '^[0-9]{11}$|^[0-9]{14}$'`,
      company_fiscal_profiles_tax_regime_check: `"company_fiscal_profiles"."tax_regime" in ('1', '2', '3')`,
      company_fiscal_profiles_version_check: `"company_fiscal_profiles"."version" > 0`,
    })
  })
})
