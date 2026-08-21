/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveVehicleCatalogSegment } from '../../src/fleet/domain/vehicle-catalog-segment.policy.js'
import { VEHICLE_TYPES } from '../../src/shared/vehicle-type.constant.js'

describe('vehicle catalog segment policy', () => {
  test('maps the automobile vehicle types to the cars segment', () => {
    for (const vehicleType of ['car', 'utility', 'van'] as const) {
      expect(resolveVehicleCatalogSegment({ role: 'traction', vehicleType })).toBe('carros')
    }
  })

  test('a motorcycle has its own FIPE table', () => {
    expect(resolveVehicleCatalogSegment({ role: 'traction', vehicleType: 'motorcycle' })).toBe(
      'motos',
    )
  })

  test('maps the remaining traction vehicle types to the trucks segment', () => {
    const types = ['other', 'three_quarter', 'toco', 'tractor_unit', 'truck', 'vuc'] as const
    for (const vehicleType of types) {
      expect(resolveVehicleCatalogSegment({ role: 'traction', vehicleType })).toBe('caminhoes')
    }
  })

  test('every vehicle type has a segment — nenhum tipo novo cai em none por esquecimento', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      expect(resolveVehicleCatalogSegment({ role: 'traction', vehicleType })).not.toBe('none')
    }
  })

  test('a trailer has no catalog coverage regardless of vehicle type', () => {
    expect(resolveVehicleCatalogSegment({ role: 'trailer', vehicleType: '' })).toBe('none')
  })

  test('traction without a vehicle type has nothing to look up', () => {
    expect(resolveVehicleCatalogSegment({ role: 'traction', vehicleType: '' })).toBe('none')
  })
})
