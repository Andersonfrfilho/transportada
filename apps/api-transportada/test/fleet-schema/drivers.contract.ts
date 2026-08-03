/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import { fleetDrivers } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const dialect = new PgDialect()

describe('fleet driver schema', () => {
  test('stores the operational record the condutor group is built from', () => {
    expect(getTableConfig(fleetDrivers).name).toBe('fleet_drivers')
    expectGeneratedUuidPrimaryKey(fleetDrivers)
    expectRequiredUtcTimestamps(fleetDrivers)

    expect(columnNames(fleetDrivers)).toEqual([
      'id',
      'company_id',
      'membership_id',
      'name',
      'tax_id',
      'linked_tax_id',
      'license_number',
      'phone',
      'status',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(fleetDrivers)).toMatchObject({
      company_id: 'uuid',
      id: 'uuid',
      membership_id: 'uuid',
      version: 'bigint',
    })
  })

  // Motorista sem login roda o MDF-e inteiro — o vínculo com identidade chega depois
  test('leaves the login link nullable and requires every other column', () => {
    expect(requiredColumnNames(fleetDrivers)).toEqual(
      columnNames(fleetDrivers).filter((column) => column !== 'membership_id'),
    )
  })

  test('scopes the CPF to the tenant and exposes the composite tenant key', () => {
    expect(uniqueColumnsByName(fleetDrivers)).toMatchObject({
      fleet_drivers_company_id_id_unique: ['company_id', 'id'],
      fleet_drivers_company_id_tax_id_unique: ['company_id', 'tax_id'],
    })
  })

  test('lets at most one driver hold a given login', () => {
    const membershipUnique = getTableConfig(fleetDrivers).indexes.find(
      (tableIndex) => tableIndex.config.name === 'fleet_drivers_company_membership_unique',
    )

    expect(membershipUnique?.config.unique).toBeTrue()
    expect(
      membershipUnique?.config.columns.map((column) => ('name' in column ? column.name : '')),
    ).toEqual(['company_id', 'membership_id'])
    expect(
      membershipUnique?.config.where === undefined
        ? undefined
        : dialect.sqlToQuery(membershipUnique.config.where).sql,
    ).toBe(`"fleet_drivers"."membership_id" is not null`)
  })

  test('constrains the fiscal identification the condutor group freezes into the XML', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_tax_id_check).toContain("~ '^[0-9]{11}$'")
    expect(checks.fleet_drivers_name_check).toContain('> 0')
    expect(checks.fleet_drivers_name_check).toContain('<= 60')
    expect(checks.fleet_drivers_status_check).toContain("in ('active', 'inactive')")
  })

  // O condutor do MDF-e é sempre pessoa física; o CNPJ do autônomo entra ao lado do CPF, nunca no lugar dele
  test('keeps the CPF mandatory and the linked CNPJ optional', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_linked_tax_id_check).toContain("~ '^[0-9]{14}$'")
    expect(checks.fleet_drivers_linked_tax_id_check).toContain('= 0')
    expect(checks.fleet_drivers_tax_id_check).not.toContain('{14}')
  })

  test('accepts an empty CNH and phone, which the MDF-e does not require', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_license_number_check).toContain("~ '^[0-9]{11}$'")
    expect(checks.fleet_drivers_license_number_check).toContain('= 0')
    expect(checks.fleet_drivers_phone_check).toContain("~ '^[0-9]{10,11}$'")
    expect(checks.fleet_drivers_phone_check).toContain('= 0')
  })

  test('starts the optimistic lock at a positive version', () => {
    expect(checkSqlByName(fleetDrivers).fleet_drivers_version_check).toContain('> 0')
  })
})
