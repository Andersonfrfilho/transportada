/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  FleetVehicleBodyTypeNotApplicableError,
  FleetVehicleBodyTypeRequiredError,
} from '../../src/fleet/domain/fleet.error'
import { checkVehicleBodyType } from '../../src/fleet/domain/vehicle-body-type.policy'
import type { VehicleType } from '../../src/shared/vehicle-type.constant'

const TRACTOR_UNIT = { bodyType: '00', role: 'traction', vehicleType: 'tractor_unit' } as const
const TRAILER = { bodyType: '02', role: 'trailer', vehicleType: '' } as const

/**
 * Feature 147 D1: `00` só é ausência real de carroceria no cavalo mecânico. Todo o resto — moto,
 * carro e os demais tipos que carregam, mais toda carreta — é obrigado a escolher; e o cavalo, ao
 * contrário, só aceita `00`.
 */
const NON_TRACTOR_VEHICLE_TYPES: VehicleType[] = [
  'motorcycle',
  'car',
  'utility',
  'van',
  'vuc',
  'three_quarter',
  'toco',
  'truck',
  'other',
]

describe('vehicle body type policy contract', () => {
  test.each(NON_TRACTOR_VEHICLE_TYPES)('requires a body type for a %s', (vehicleType) => {
    expect(() => checkVehicleBodyType({ bodyType: '00', role: 'traction', vehicleType })).toThrow(
      FleetVehicleBodyTypeRequiredError,
    )
  })

  test('requires a body type for a trailer', () => {
    expect(() => checkVehicleBodyType({ ...TRAILER, bodyType: '00' })).toThrow(
      FleetVehicleBodyTypeRequiredError,
    )
  })

  test('accepts body type 00 for a tractor unit', () => {
    expect(() => checkVehicleBodyType(TRACTOR_UNIT)).not.toThrow()
  })

  test('refuses a body type other than 00 for a tractor unit', () => {
    expect(() => checkVehicleBodyType({ ...TRACTOR_UNIT, bodyType: '02' })).toThrow(
      FleetVehicleBodyTypeNotApplicableError,
    )
  })

  test('accepts a body type other than 00 for a trailer', () => {
    expect(() => checkVehicleBodyType(TRAILER)).not.toThrow()
  })
})
