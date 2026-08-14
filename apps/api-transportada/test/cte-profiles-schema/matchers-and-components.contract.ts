/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  cteEmissionProfileComponents,
  cteEmissionProfileMatchers,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('cte emission profile matcher schema', () => {
  test('binds a client tax id to exactly one profile per tenant', () => {
    expect(getTableConfig(cteEmissionProfileMatchers).name).toBe('cte_emission_profile_matchers')

    expect(columnNames(cteEmissionProfileMatchers)).toEqual([
      'id',
      'company_id',
      'profile_id',
      'tax_id',
      'match_role',
      'created_at',
    ])

    expect(uniqueColumnsByName(cteEmissionProfileMatchers)).toMatchObject({
      cte_emission_profile_matchers_company_id_id_unique: ['company_id', 'id'],
      cte_emission_profile_matchers_company_tax_id_role_unique: [
        'company_id',
        'tax_id',
        'match_role',
      ],
    })
  })

  test('accepts either a full CNPJ or its 8-digit root, nothing else', () => {
    const checks = checkSqlByName(cteEmissionProfileMatchers)

    expect(checks.cte_emission_profile_matchers_tax_id_check).toContain('^[A-Z0-9]{8}$')
    expect(checks.cte_emission_profile_matchers_tax_id_check).toContain('^[A-Z0-9]{12}[0-9]{2}$')
    expect(checks.cte_emission_profile_matchers_match_role_check).toContain(
      "in ('sender', 'recipient')",
    )
  })
})

describe('cte emission profile component schema', () => {
  test('stores each priced component that becomes a Comp element in vPrest', () => {
    expect(getTableConfig(cteEmissionProfileComponents).name).toBe(
      'cte_emission_profile_components',
    )

    expect(columnNames(cteEmissionProfileComponents)).toEqual([
      'id',
      'company_id',
      'profile_id',
      'ordinal',
      'label',
      'calculation_type',
      'rate',
      'amount',
      'valid_from',
      'valid_until',
      'created_at',
      'updated_at',
    ])

    expect(columnSqlTypes(cteEmissionProfileComponents)).toMatchObject({
      amount: 'numeric(19, 4)',
      ordinal: 'bigint',
      rate: 'numeric(9, 6)',
    })
  })

  test('keeps component order stable per profile', () => {
    expect(uniqueColumnsByName(cteEmissionProfileComponents)).toMatchObject({
      cte_emission_profile_components_company_id_id_unique: ['company_id', 'id'],
      cte_emission_profile_components_profile_ordinal_unique: [
        'company_id',
        'profile_id',
        'ordinal',
      ],
    })
  })

  test('rejects a component that mixes a rate with a fixed amount', () => {
    const checks = checkSqlByName(cteEmissionProfileComponents)

    expect(checks.cte_emission_profile_components_calculation_type_check).toContain(
      "in ('percentage_of_cargo', 'percentage_of_freight', 'fixed_amount')",
    )
    expect(checks.cte_emission_profile_components_value_coherence_check).toContain('fixed_amount')
    expect(checks.cte_emission_profile_components_rate_check).toContain('<= 1')
    expect(checks.cte_emission_profile_components_validity_check).toContain('valid_until')
  })
})
