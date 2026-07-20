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
      version: 'bigint',
      created_at: 'timestamp with time zone',
      updated_at: 'timestamp with time zone',
    })

    const companyId = getTableConfig(companyFiscalProfiles).columns.find(
      (column) => column.name === 'company_id',
    )
    expect(companyId?.primary).toBeTrue()
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
      company_fiscal_profiles_cnpj_check: `"company_fiscal_profiles"."cnpj" ~ '^[0-9]{14}$'`,
      company_fiscal_profiles_environment_check: `"company_fiscal_profiles"."environment" in ('homologation', 'production')`,
      company_fiscal_profiles_tax_regime_check: `"company_fiscal_profiles"."tax_regime" in ('1', '2', '3')`,
      company_fiscal_profiles_version_check: `"company_fiscal_profiles"."version" > 0`,
    })
  })
})
