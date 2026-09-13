/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, VEHICLE_DETAIL } from './fleet.fixture'

const VALIDATION_PATH = '../../src/modules/fleet/shared/fleetResponse.validation'
const TRAILER_ID = '00000000-0000-4000-8000-000000000916'

type FleetAdaptersModule = {
  readonly createFleetResponseAdapters: () => {
    readonly vehicleFromApi: (input: unknown) => unknown
  }
}

/** Spec 147 D3: a carreta padrão do cavalo — a ficha do veículo aprende a chave nova. */
describe('fleet vehicle default trailer response contract', () => {
  test('accepts a null default trailer and an uuid one, and rejects a malformed value', async () => {
    const { createFleetResponseAdapters } =
      await loadFutureModule<FleetAdaptersModule>(VALIDATION_PATH)
    const adapters = createFleetResponseAdapters()

    expect(adapters.vehicleFromApi(VEHICLE_DETAIL)).toEqual(VEHICLE_DETAIL)
    expect(
      adapters.vehicleFromApi({ ...VEHICLE_DETAIL, defaultTrailerVehicleId: TRAILER_ID }),
    ).toEqual({ ...VEHICLE_DETAIL, defaultTrailerVehicleId: TRAILER_ID })
    expect(() =>
      adapters.vehicleFromApi({ ...VEHICLE_DETAIL, defaultTrailerVehicleId: 42 }),
    ).toThrow('FLEET_RESPONSE_INVALID')

    const { defaultTrailerVehicleId, ...withoutDefaultTrailer } = VEHICLE_DETAIL
    expect(defaultTrailerVehicleId).toBeNull()
    expect(() => adapters.vehicleFromApi(withoutDefaultTrailer)).toThrow('FLEET_RESPONSE_INVALID')
  })
})
