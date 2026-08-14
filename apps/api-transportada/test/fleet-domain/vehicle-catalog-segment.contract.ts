/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveVehicleCatalogSegment } from '../../src/fleet/domain/vehicle-catalog-segment.policy.js'

describe('vehicle catalog segment policy', () => {
  test('maps the automobile wheel types to the cars segment', () => {
    for (const wheelType of ['04', '05'] as const) {
      expect(resolveVehicleCatalogSegment({ role: 'traction', wheelType })).toBe('carros')
    }
  })

  test('maps the remaining traction wheel types to the trucks segment', () => {
    for (const wheelType of ['01', '02', '03', '06'] as const) {
      expect(resolveVehicleCatalogSegment({ role: 'traction', wheelType })).toBe('caminhoes')
    }
  })

  test('a trailer has no catalog coverage regardless of wheel type', () => {
    expect(resolveVehicleCatalogSegment({ role: 'trailer', wheelType: '' })).toBe('none')
  })
})
