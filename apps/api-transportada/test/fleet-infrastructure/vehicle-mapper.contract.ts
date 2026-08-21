/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O R$/km é derivado do preço efetivo do combustível **do veículo**, e o contrato HTTP não alcança
 * essa junção: lá os use cases são dublês. Aqui o mapeador recebe o registro e a tabela de preços da
 * empresa, que é onde a coerência por combustível se decide.
 */
import { describe, expect, test } from 'bun:test'

import type { fleetVehicles } from '../../src/database/fleet.schema.js'
import { mapVehicle } from '../../src/fleet/infrastructure/fleet.mapper.js'
import type { EffectiveFuelPrice } from '../../src/companies/domain/fuel-price.policy.js'
import type { FuelProduct } from '../../src/shared/fuel.constant.js'

type VehicleRecord = typeof fleetVehicles.$inferSelect

const TIMESTAMP = new Date('2026-08-10T12:00:00.000Z')

const RECORD: VehicleRecord = {
  acquisitionAmount: '0.0000',
  annualInsuranceAmount: '0.0000',
  annualVehicleTaxAmount: '0.0000',
  averageConsumption: '12.00',
  axleCount: 0,
  bodyType: '00',
  brand: '',
  capacityKg: '27000.00',
  capacityM3: '90.00',
  color: '',
  companyId: '00000000-0000-4000-8000-000000000901',
  costsUpdatedAt: null,
  createdAt: TIMESTAMP,
  fleetNumber: '',
  fuelType: 'diesel-s10',
  id: '00000000-0000-4000-8000-000000000911',
  model: '',
  modelYear: 0,
  monthlyInstallmentAmount: '0.0000',
  otherCostsPerKilometer: '0.5000',
  ownerName: '',
  ownerRntrc: '',
  ownerState: '',
  ownerTaxId: '',
  ownerTaxRegime: '',
  ownership: 'own',
  plate: 'ABC1D23',
  renavam: '12345678901',
  role: 'traction',
  state: 'SP',
  status: 'active',
  tareWeightKg: '8000.00',
  updatedAt: TIMESTAMP,
  vehicleType: 'tractor_unit',
  version: 1n,
}

const DIESEL_PRICE: EffectiveFuelPrice = {
  effectivePricePerUnit: '5.4800',
  product: 'diesel-s10',
  reference: { pricePerUnit: '5.2000', state: 'SP', weekEndingOn: '2026-08-08' },
  source: 'manual',
  unit: 'litre',
  updatedAt: TIMESTAMP,
}

const GNV_PRICE: EffectiveFuelPrice = {
  effectivePricePerUnit: '4.0000',
  product: 'gnv',
  reference: { pricePerUnit: '4.0000', state: 'SP', weekEndingOn: '2026-08-08' },
  source: 'anp',
  unit: 'cubic-metre',
  updatedAt: null,
}

const FUEL_PRICES: ReadonlyMap<FuelProduct, EffectiveFuelPrice> = new Map([
  ['diesel-s10', DIESEL_PRICE],
  ['gnv', GNV_PRICE],
])

describe('fleet vehicle mapper cost contract', () => {
  test('derives the cost per kilometer from the effective price of the vehicle fuel', () => {
    const vehicle = mapVehicle({ fuelPrices: FUEL_PRICES, record: RECORD })

    expect(vehicle.costPerKilometer).toBe('0.9567')
    expect(vehicle.costPerKilometerBreakdown).toEqual({ fuel: '0.4567', otherCosts: '0.5000' })
    expect(vehicle.fuelPrice).toEqual({
      pricePerUnit: '5.4800',
      source: 'manual',
      unit: 'litre',
      weekEndingOn: '2026-08-08',
    })
  })

  test('derives two vehicles of different fuels from different prices and units', () => {
    const diesel = mapVehicle({ fuelPrices: FUEL_PRICES, record: RECORD })
    const gas = mapVehicle({
      fuelPrices: FUEL_PRICES,
      record: { ...RECORD, averageConsumption: '10.00', fuelType: 'gnv' },
    })

    expect(gas.costPerKilometer).toBe('0.9000')
    expect(gas.costPerKilometerBreakdown).toEqual({ fuel: '0.4000', otherCosts: '0.5000' })
    expect(gas.fuelPrice?.unit).toBe('cubic-metre')
    expect(gas.costPerKilometer).not.toBe(diesel.costPerKilometer)
  })

  test('nulls the price and drops the fuel parcel when the fuel has no price in the company', () => {
    const vehicle = mapVehicle({
      fuelPrices: FUEL_PRICES,
      record: { ...RECORD, fuelType: 'etanol-hidratado' },
    })

    expect(vehicle.fuelPrice).toBeNull()
    expect(vehicle.costPerKilometer).toBe('0.5000')
    expect(vehicle.costPerKilometerBreakdown).toEqual({ otherCosts: '0.5000' })
  })

  test('nulls the derived trio when neither consumption nor other costs are informed', () => {
    const vehicle = mapVehicle({
      fuelPrices: FUEL_PRICES,
      record: { ...RECORD, averageConsumption: '0.00', otherCostsPerKilometer: '0.0000' },
    })

    expect(vehicle.costPerKilometer).toBeNull()
    expect(vehicle.costPerKilometerBreakdown).toBeNull()
    expect(vehicle.fuelPrice).toEqual({
      pricePerUnit: '5.4800',
      source: 'manual',
      unit: 'litre',
      weekEndingOn: '2026-08-08',
    })
  })
})
