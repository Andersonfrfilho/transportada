/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { cteEmissionProfiles } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('cte emission profile schema', () => {
  test('stores the fiscal parameters an operator configures per client', () => {
    expect(getTableConfig(cteEmissionProfiles).name).toBe('cte_emission_profiles')

    expect(columnNames(cteEmissionProfiles)).toEqual([
      'id',
      'company_id',
      'name',
      'status',
      'priority',
      'match_mode',
      'grouping_mode',
      'freight_rule_id',
      'taker',
      'service_type',
      'modal',
      'cfop_internal',
      'cfop_interstate',
      'operation_nature',
      'receiver_ie_indicator',
      'pickup_indicator',
      'pickup_details',
      'predominant_product_mode',
      'predominant_product_name',
      'delivery_days',
      'charge_component_label',
      'observations',
      'icms_cst',
      'icms_rate',
      'icms_base_reduction_rate',
      'cargo_insurance_declared',
      'version',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
  })

  test('keeps monetary-adjacent rates decimal and never floating point', () => {
    expect(columnSqlTypes(cteEmissionProfiles)).toMatchObject({
      cargo_insurance_declared: 'boolean',
      company_id: 'uuid',
      delivery_days: 'bigint',
      icms_base_reduction_rate: 'numeric(9, 6)',
      icms_rate: 'numeric(9, 6)',
      id: 'uuid',
      priority: 'bigint',
      version: 'bigint',
    })
  })

  test('requires every column — optional fiscal fields carry explicit empty defaults', () => {
    expect(requiredColumnNames(cteEmissionProfiles)).toEqual(columnNames(cteEmissionProfiles))
  })

  test('scopes name uniqueness to the tenant and exposes the composite tenant key', () => {
    expect(uniqueColumnsByName(cteEmissionProfiles)).toMatchObject({
      cte_emission_profiles_company_id_id_unique: ['company_id', 'id'],
      cte_emission_profiles_company_id_name_unique: ['company_id', 'name'],
    })
  })

  test('constrains every fiscal enumeration so an invalid CT-e can never be persisted', () => {
    const checks = checkSqlByName(cteEmissionProfiles)

    expect(checks).toMatchObject({
      cte_emission_profiles_cfop_check: expect.stringContaining("~ '^[0-9]{4}$'"),
      cte_emission_profiles_grouping_mode_check: expect.stringContaining(
        "in ('per_invoice', 'sender_recipient')",
      ),
      cte_emission_profiles_icms_cst_check: expect.stringContaining(
        "in ('00', '20', '40', '41', '51', '60', '90')",
      ),
      cte_emission_profiles_match_mode_check: expect.stringContaining(
        "in ('sender_tax_id', 'manual')",
      ),
      cte_emission_profiles_modal_check: expect.stringContaining(
        "in ('01', '02', '03', '04', '05')",
      ),
      cte_emission_profiles_pickup_indicator_check: expect.stringContaining("in ('0', '1')"),
      cte_emission_profiles_predominant_product_mode_check: expect.stringContaining(
        "in ('highest_value', 'highest_weight', 'fixed')",
      ),
      cte_emission_profiles_receiver_ie_indicator_check:
        expect.stringContaining("in ('1', '2', '9')"),
      cte_emission_profiles_service_type_check: expect.stringContaining(
        "in ('0', '1', '2', '3', '4')",
      ),
      cte_emission_profiles_status_check: expect.stringContaining(
        "in ('draft', 'active', 'inactive')",
      ),
      cte_emission_profiles_taker_check: expect.stringContaining("in ('0', '1', '2', '3')"),
    })
  })

  test('bounds rates to a fraction and keeps natOp within the 60 characters SEFAZ accepts', () => {
    const checks = checkSqlByName(cteEmissionProfiles)

    expect(checks.cte_emission_profiles_icms_rate_check).toContain('>= 0')
    expect(checks.cte_emission_profiles_icms_rate_check).toContain('<= 1')
    expect(checks.cte_emission_profiles_operation_nature_check).toContain('<= 60')
    expect(checks.cte_emission_profiles_delivery_days_check).toContain('>= 0')
    expect(checks.cte_emission_profiles_priority_check).toContain('> 0')
    expect(checks.cte_emission_profiles_version_check).toContain('> 0')
  })

  test('requires a fixed predominant product name exactly when the mode is fixed', () => {
    expect(
      checkSqlByName(cteEmissionProfiles).cte_emission_profiles_predominant_product_check,
    ).toContain("'fixed'")
  })

  test('accepts pickup details only when the pickup indicator says the receiver picks up', () => {
    const check = checkSqlByName(cteEmissionProfiles).cte_emission_profiles_pickup_details_check

    expect(check).toContain('"pickup_indicator" = \'0\'')
    expect(check).toContain('<= 160')
  })
})
