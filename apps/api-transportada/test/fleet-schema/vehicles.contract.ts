/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { fleetVehicles } from '../../src/database/database.schema.js'
import { VEHICLE_COLORS } from '../../src/database/fleet.schema.js'
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
      'brand',
      'model',
      'model_year',
      'color',
      'fleet_number',
      'role',
      'status',
      'tare_weight_kg',
      'capacity_kg',
      'capacity_m3',
      'body_type',
      'axle_count',
      'vehicle_type',
      'state',
      'ownership',
      'owner_tax_id',
      'owner_name',
      'owner_state',
      'owner_rntrc',
      'owner_tax_regime',
      'average_consumption',
      'fuel_type',
      'secondary_fuel_type',
      'secondary_average_consumption',
      'other_costs_per_kilometer',
      'acquisition_amount',
      'monthly_installment_amount',
      'annual_vehicle_tax_amount',
      'annual_insurance_amount',
      'costs_updated_at',
      'version',
      'created_at',
      'updated_at',
    ])
  })

  test('keeps weights and volumes in exact decimal, integral only at the MDF-e boundary', () => {
    expect(columnSqlTypes(fleetVehicles)).toMatchObject({
      axle_count: 'integer',
      capacity_kg: 'numeric(12, 2)',
      capacity_m3: 'numeric(12, 2)',
      company_id: 'uuid',
      id: 'uuid',
      model_year: 'integer',
      tare_weight_kg: 'numeric(12, 2)',
      version: 'bigint',
    })
  })

  test('keeps cost and consumption fields in exact decimal, never binary float', () => {
    expect(columnSqlTypes(fleetVehicles)).toMatchObject({
      acquisition_amount: 'numeric(19, 4)',
      annual_insurance_amount: 'numeric(19, 4)',
      annual_vehicle_tax_amount: 'numeric(19, 4)',
      average_consumption: 'numeric(6, 2)',
      costs_updated_at: 'timestamp with time zone',
      fuel_type: 'varchar(20)',
      monthly_installment_amount: 'numeric(19, 4)',
      other_costs_per_kilometer: 'numeric(19, 4)',
    })
  })

  /**
   * O R$/km passou a ser derivado do preço do combustível: guardá-lo congelaria o número na data em
   * que alguém digitou, que é exatamente o defeito que a spec 038 fecha.
   */
  test('no longer stores the cost per kilometer, which is derived at read time', () => {
    expect(columnNames(fleetVehicles)).not.toContain('cost_per_kilometer')
  })

  test('gives the new cost fields a default, so no existing vehicle blocks the migration', () => {
    const columns = getTableConfig(fleetVehicles).columns
    const fuelType = columns.find((column) => column.name === 'fuel_type')
    const otherCosts = columns.find((column) => column.name === 'other_costs_per_kilometer')

    expect(fuelType?.notNull).toBeTrue()
    expect(fuelType?.default).toBe('diesel-s10')
    expect(otherCosts?.notNull).toBeTrue()
    expect(otherCosts?.default).toBe('0')
  })

  // costs_updated_at fica nulo até o primeiro custo ser informado — não há "vazio" para timestamp
  test('requires every column — optional owner fields carry explicit empty defaults', () => {
    expect(requiredColumnNames(fleetVehicles)).toEqual(
      columnNames(fleetVehicles).filter((name) => name !== 'costs_updated_at'),
    )
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

  // `tpRod` e a classe de frete saem daqui — reboque não escolhe tipo, e tração escolhe um da lista
  test('requires the vehicle type exactly on the traction vehicle', () => {
    const check = checkSqlByName(fleetVehicles).fleet_vehicles_vehicle_type_check

    expect(check).toContain("'traction'")
    expect(check).toContain("'motorcycle'")
    expect(check).toContain("'car'")
    expect(check).toContain("'tractor_unit'")
  })

  test('keeps tare and capacity non-negative', () => {
    const check = checkSqlByName(fleetVehicles).fleet_vehicles_capacity_check

    expect(check).toContain('>= 0')
  })

  // 0 é "não informado" em todo campo de custo — nenhum motorista trava o cadastro por falta de nota
  test('keeps every cost and consumption field non-negative', () => {
    const check = checkSqlByName(fleetVehicles).fleet_vehicles_cost_check

    expect(check).toContain('>= 0')
  })

  // Emitir <prop> com o CNPJ do emitente é rejeição — veículo próprio não tem proprietário
  test('emits the owner group only when the vehicle is not the carrier own', () => {
    const checks = checkSqlByName(fleetVehicles)

    expect(checks.fleet_vehicles_owner_check).toContain("'own'")
    expect(checks.fleet_vehicles_owner_tax_id_check).toContain("~ '^[0-9]{11}$'")
    expect(checks.fleet_vehicles_owner_tax_id_check).toContain("~ '^[A-Z0-9]{12}[0-9]{2}$'")
    // O cadastro do proprietário guarda o registro como o certificado da ANTT o imprime.
    expect(checks.fleet_vehicles_owner_rntrc_check).toContain("~ '^0?[0-9]{8}$'")
    expect(checks.fleet_vehicles_owner_tax_regime_check).toContain("in ('0', '1', '2')")
  })

  test('starts the optimistic lock at a positive version', () => {
    expect(checkSqlByName(fleetVehicles).fleet_vehicles_version_check).toContain('> 0')
  })

  // 0 é "não informado" — o motorista que buscou pela placa preenche depois, ninguém trava o salvamento
  test('accepts zero as not-informed for model year and axle count, else a plausible range', () => {
    const checks = checkSqlByName(fleetVehicles)

    expect(checks.fleet_vehicles_model_year_check).toContain('= 0')
    expect(checks.fleet_vehicles_model_year_check).toContain('between 1900 and 2100')
    expect(checks.fleet_vehicles_axle_count_check).toContain('= 0')
    expect(checks.fleet_vehicles_axle_count_check).toContain('between 2 and 9')
  })

  test('bounds brand, model and fleet number to what the catalog and the CRLV hold', () => {
    const checks = checkSqlByName(fleetVehicles)

    expect(checks.fleet_vehicles_brand_check).toContain('<= 60')
    expect(checks.fleet_vehicles_model_check).toContain('<= 120')
    expect(checks.fleet_vehicles_fleet_number_check).toContain('<= 20')
  })

  /** Cor é lista fechada do Denatran: em texto livre a mesma frota grava "branca" e "BRANCO". */
  test('closes the color in the Denatran list, still allowing it to be blank', () => {
    const check = checkSqlByName(fleetVehicles).fleet_vehicles_color_check

    expect(check).toContain('= 0')
    for (const color of VEHICLE_COLORS) {
      expect(check).toContain(`'${color}'`)
    }
  })
})
