/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyFuelPrices, fuelPriceReferences } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('fuel price reference schema', () => {
  test('stores one collected price per product, state and week', () => {
    expect(getTableConfig(fuelPriceReferences).name).toBe('fuel_price_references')
    expectGeneratedUuidPrimaryKey(fuelPriceReferences)

    expect(columnNames(fuelPriceReferences)).toEqual([
      'id',
      'product',
      'state',
      'week_ending_on',
      'price_per_unit',
      'station_count',
      'collected_at',
    ])
    expect(requiredColumnNames(fuelPriceReferences)).toEqual(columnNames(fuelPriceReferences))
  })

  test('keeps the published price in exact decimal, never binary float', () => {
    expect(columnSqlTypes(fuelPriceReferences)).toMatchObject({
      collected_at: 'timestamp with time zone',
      price_per_unit: 'numeric(19, 4)',
      product: 'varchar(20)',
      state: 'char(2)',
      station_count: 'integer',
      week_ending_on: 'date',
    })
  })

  /** A chave natural é a idempotência do ciclo: reexecutar a mesma semana não duplica linha. */
  test('makes the week, the product and the state the natural key', () => {
    expect(uniqueColumnsByName(fuelPriceReferences)).toMatchObject({
      fuel_price_references_natural_unique: ['product', 'state', 'week_ending_on'],
    })
  })

  test('refuses a price that is not positive and a station count that is negative', () => {
    const checks = checkSqlByName(fuelPriceReferences)

    expect(checks.fuel_price_references_price_check).toContain('> 0')
    expect(checks.fuel_price_references_station_count_check).toContain('>= 0')
    expect(checks.fuel_price_references_state_check).toContain("~ '^[A-Z]{2}$'")
  })
})

describe('company fuel price schema', () => {
  test('holds at most one adjusted price per product, per company', () => {
    expect(getTableConfig(companyFuelPrices).name).toBe('company_fuel_prices')
    expectRequiredUtcTimestamps(companyFuelPrices)

    expect(columnNames(companyFuelPrices)).toEqual([
      'company_id',
      'product',
      'price_per_unit',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(companyFuelPrices)).toEqual(columnNames(companyFuelPrices))

    const primaryKeyColumns = getTableConfig(companyFuelPrices).primaryKeys[0]?.columns.map(
      (column) => column.name,
    )
    expect(primaryKeyColumns).toEqual(['company_id', 'product'])
  })

  test('keeps the adjusted price in exact decimal, never binary float', () => {
    expect(columnSqlTypes(companyFuelPrices)).toMatchObject({
      company_id: 'uuid',
      price_per_unit: 'numeric(19, 4)',
      product: 'varchar(20)',
    })
  })

  // Ausência de linha é ausência de ajuste — nunca zero, que seria combustível de graça
  test('refuses a price that is not positive', () => {
    expect(checkSqlByName(companyFuelPrices).company_fuel_prices_price_check).toContain('> 0')
  })
})
