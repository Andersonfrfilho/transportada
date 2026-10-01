/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { FleetVehicleDefaultTrailerRequiresTractorError } from '../../src/fleet/domain/fleet.error'
import { checkVehicleDefaultTrailer } from '../../src/fleet/domain/vehicle-default-trailer.policy'
import type { VehicleType } from '../../src/shared/vehicle-type.constant'

const TRAILER_ID = '00000000-0000-4000-8000-000000000916'

/**
 * Feature 147 D3: a carreta padrão só faz sentido no cavalo — o restante do catálogo, incluindo a
 * carreta em si (`vehicleType: ''`), não escolhe a própria carreta padrão.
 */
const NON_TRACTOR_VEHICLE_TYPES: (VehicleType | '')[] = [
  '',
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

describe('vehicle default trailer policy contract', () => {
  test.each(NON_TRACTOR_VEHICLE_TYPES)('refuses a default trailer for a %s', (vehicleType) => {
    expect(() =>
      checkVehicleDefaultTrailer({ defaultTrailerVehicleId: TRAILER_ID, vehicleType }),
    ).toThrow(FleetVehicleDefaultTrailerRequiresTractorError)
  })

  test('accepts a default trailer for a tractor unit', () => {
    expect(() =>
      checkVehicleDefaultTrailer({
        defaultTrailerVehicleId: TRAILER_ID,
        vehicleType: 'tractor_unit',
      }),
    ).not.toThrow()
  })

  test('accepts no default trailer for any vehicle type', () => {
    for (const vehicleType of [...NON_TRACTOR_VEHICLE_TYPES, 'tractor_unit'] as const) {
      expect(() =>
        checkVehicleDefaultTrailer({ defaultTrailerVehicleId: null, vehicleType }),
      ).not.toThrow()
    }
  })
})
