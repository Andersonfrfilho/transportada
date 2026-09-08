/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyTollBoothCharges } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectRequiredUtcTimestamps,
  requiredColumnNames,
} from '../fiscal-schema/support.js'

describe('company toll booth charge schema (spec 095)', () => {
  test('holds at most one adjustment per praça, per company', () => {
    expect(getTableConfig(companyTollBoothCharges).name).toBe('company_toll_booth_charges')
    expectRequiredUtcTimestamps(companyTollBoothCharges)

    expect(columnNames(companyTollBoothCharges)).toEqual([
      'company_id',
      'osm_node_id',
      'charge_per_axle',
      'charge_car',
      'charge_per_axle_automatic',
      'observed_on',
      'actor_user_id',
      'created_at',
      'updated_at',
    ])
    // Os dois valores de tarifa são os únicos opcionais — a linha em si é obrigatória por inteiro
    expect(requiredColumnNames(companyTollBoothCharges)).toEqual([
      'company_id',
      'osm_node_id',
      'observed_on',
      'actor_user_id',
      'created_at',
      'updated_at',
    ])

    const primaryKeyColumns = getTableConfig(companyTollBoothCharges).primaryKeys[0]?.columns.map(
      (column) => column.name,
    )
    expect(primaryKeyColumns).toEqual(['company_id', 'osm_node_id'])
  })

  test('keeps the adjusted charge in exact decimal, never binary float', () => {
    expect(columnSqlTypes(companyTollBoothCharges)).toMatchObject({
      charge_car: 'numeric(19, 4)',
      charge_per_axle: 'numeric(19, 4)',
      company_id: 'uuid',
      observed_on: 'date',
      osm_node_id: 'bigint',
    })
  })

  test('refuses a negative charge and an adjustment with neither field filled', () => {
    const checks = checkSqlByName(companyTollBoothCharges)

    expect(checks.company_toll_booth_charges_charge_per_axle_check).toContain('>= 0')
    expect(checks.company_toll_booth_charges_charge_car_check).toContain('>= 0')
    expect(checks.company_toll_booth_charges_charge_per_axle_automatic_check).toContain('>= 0')
    expect(checks.company_toll_booth_charges_charge_presence_check).toContain('is not null')
  })
})
