/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { fleetVehicles } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('fleet vehicle schema', () => {
  test('stores every field the MDF-e vehicle group demands, without typing at issuance', () => {
    expect(getTableConfig(fleetVehicles).name).toBe('fleet_vehicles')
    expectGeneratedUuidPrimaryKey(fleetVehicles)
    expectRequiredUtcTimestamps(fleetVehicles)

    expect(columnNames(fleetVehicles)).toEqual([
      'id',
      'company_id',
      'plate',
      'renavam',
      'role',
      'status',
      'tare_weight_kg',
      'capacity_kg',
      'capacity_m3',
      'wheel_type',
      'body_type',
      'state',
      'ownership',
      'owner_tax_id',
      'owner_name',
      'owner_state',
      'owner_rntrc',
      'owner_tax_regime',
      'version',
      'created_at',
      'updated_at',
    ])
  })

  test('keeps weights and volumes integral, as the MDF-e layout transmits them', () => {
    expect(columnSqlTypes(fleetVehicles)).toMatchObject({
      capacity_kg: 'bigint',
      capacity_m3: 'bigint',
      company_id: 'uuid',
      id: 'uuid',
      tare_weight_kg: 'bigint',
      version: 'bigint',
    })
  })

  test('requires every column — optional owner fields carry explicit empty defaults', () => {
    expect(requiredColumnNames(fleetVehicles)).toEqual(columnNames(fleetVehicles))
  })

  test('scopes the plate to the tenant and exposes the composite tenant key', () => {
    expect(uniqueColumnsByName(fleetVehicles)).toMatchObject({
      fleet_vehicles_company_id_id_unique: ['company_id', 'id'],
      fleet_vehicles_company_id_plate_unique: ['company_id', 'plate'],
    })
    expect(indexColumnsByName(fleetVehicles)).toMatchObject({
      fleet_vehicles_company_status_plate_idx: ['company_id', 'status', 'plate'],
    })
  })

  test('accepts both the Mercosul and the legacy plate, and no separator', () => {
    expect(checkSqlByName(fleetVehicles).fleet_vehicles_plate_check).toContain(
      "~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'",
    )
  })

  test('constrains the SEFAZ enumerations so a rejected vehicle can never be persisted', () => {
    const checks = checkSqlByName(fleetVehicles)

    expect(checks).toMatchObject({
      fleet_vehicles_body_type_check: expect.stringContaining(
        "in ('00', '01', '02', '03', '04', '05')",
      ),
      fleet_vehicles_ownership_check: expect.stringContaining(
        "in ('own', 'aggregate', 'third_party')",
      ),
      fleet_vehicles_role_check: expect.stringContaining("in ('traction', 'trailer')"),
      fleet_vehicles_state_check: expect.stringContaining("~ '^[A-Z]{2}$'"),
      fleet_vehicles_status_check: expect.stringContaining("in ('active', 'inactive')"),
    })
  })

  // tpRod só existe no veicTracao — enviar rodado num reboque é rejeição
  test('requires the wheel type exactly on the traction vehicle', () => {
    const check = checkSqlByName(fleetVehicles).fleet_vehicles_wheel_type_check

    expect(check).toContain("'traction'")
    expect(check).toContain("in ('01', '02', '03', '04', '05', '06')")
  })

  test('keeps tare and capacity non-negative', () => {
    const check = checkSqlByName(fleetVehicles).fleet_vehicles_capacity_check

    expect(check).toContain('>= 0')
  })

  // Emitir <prop> com o CNPJ do emitente é rejeição — veículo próprio não tem proprietário
  test('emits the owner group only when the vehicle is not the carrier own', () => {
    const checks = checkSqlByName(fleetVehicles)

    expect(checks.fleet_vehicles_owner_check).toContain("'own'")
    expect(checks.fleet_vehicles_owner_tax_id_check).toContain("~ '^[0-9]{11}$'")
    expect(checks.fleet_vehicles_owner_tax_id_check).toContain("~ '^[0-9]{14}$'")
    // O cadastro do proprietário guarda o registro como o certificado da ANTT o imprime.
    expect(checks.fleet_vehicles_owner_rntrc_check).toContain("~ '^0?[0-9]{8}$'")
    expect(checks.fleet_vehicles_owner_tax_regime_check).toContain("in ('0', '1', '2')")
  })

  test('starts the optimistic lock at a positive version', () => {
    expect(checkSqlByName(fleetVehicles).fleet_vehicles_version_check).toContain('> 0')
  })
})
