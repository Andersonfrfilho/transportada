/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { fleetVehicles } from '../../src/database/fleet.schema.js'
import { createVehicleSchema } from '../../src/fleet/presentation/fleet-request.schema.js'
import {
  MEASURE_SCALE,
  formatDecimalAtScale,
  roundDecimalToInteger,
} from '../../src/shared/decimal.service.js'

const VEHICLE_BODY = {
  acquisitionAmount: '0.0000',
  annualInsuranceAmount: '0.0000',
  annualVehicleTaxAmount: '0.0000',
  averageConsumption: '0.00',
  axleCount: 3,
  bodyType: '02',
  brand: 'Volvo',
  capacityCubicMeters: '90.50',
  capacityKilograms: '27000.75',
  color: 'branca',
  fleetNumber: '',
  fuelType: 'diesel-s10',
  model: 'FH 540',
  modelYear: 2024,
  monthlyInstallmentAmount: '0.0000',
  otherCostsPerKilometer: '0.0000',
  owner: null,
  ownership: 'own',
  plate: 'AAA1B11',
  renavam: '',
  role: 'traction',
  secondaryAverageConsumption: '0.00',
  secondaryFuelType: '',
  state: 'SP',
  tareWeightKilograms: '8000.25',
  vehicleType: 'truck',
} as const

describe('vehicle measure decimals', () => {
  test('keeps tare and capacity as decimals in the schema', () => {
    expect(fleetVehicles.tareWeightKg.columnType).toBe('PgNumeric')
    expect(fleetVehicles.capacityKg.columnType).toBe('PgNumeric')
    expect(fleetVehicles.capacityM3.columnType).toBe('PgNumeric')
    expect(fleetVehicles.tareWeightKg.notNull).toBe(true)
    expect(fleetVehicles.capacityKg.notNull).toBe(true)
    expect(fleetVehicles.capacityM3.notNull).toBe(true)
  })

  test('accepts the two decimal places the vehicle form types and refuses anything else', () => {
    const parsed = createVehicleSchema.parse(VEHICLE_BODY)
    expect(parsed.tareWeightKilograms).toBe('8000.25')
    expect(parsed.capacityCubicMeters).toBe('90.50')
    expect(
      createVehicleSchema.safeParse({ ...VEHICLE_BODY, capacityKilograms: '0.00' }).success,
    ).toBe(true)
    expect(
      createVehicleSchema.safeParse({ ...VEHICLE_BODY, capacityKilograms: '27000' }).success,
    ).toBe(false)
    expect(
      createVehicleSchema.safeParse({ ...VEHICLE_BODY, capacityKilograms: '27000.755' }).success,
    ).toBe(false)
    expect(
      createVehicleSchema.safeParse({ ...VEHICLE_BODY, capacityKilograms: '-1.00' }).success,
    ).toBe(false)
  })

  test('rounds half up only where the MDF-e layout demands an integer', () => {
    expect(MEASURE_SCALE).toBe(2n)
    expect(formatDecimalAtScale('8000', MEASURE_SCALE)).toBe('8000.00')
    expect(formatDecimalAtScale('8000.2', MEASURE_SCALE)).toBe('8000.20')
    expect(formatDecimalAtScale('8000.255', MEASURE_SCALE)).toBe('8000.26')
    expect(roundDecimalToInteger('8000.25')).toBe(8000n)
    expect(roundDecimalToInteger('8000.50')).toBe(8001n)
    expect(roundDecimalToInteger('0.49')).toBe(0n)
    expect(roundDecimalToInteger('0.50')).toBe(1n)
  })
})
