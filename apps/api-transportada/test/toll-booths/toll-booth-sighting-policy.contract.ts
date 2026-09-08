/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { extractSeenTollBoothNodeIds } from '../../src/toll-booths/domain/toll-booth-sighting.policy.js'

function plannedToll(osmNodeIds: readonly number[]): unknown {
  return {
    axles: { count: 2, source: 'declared' },
    booths: osmNodeIds.map((osmNodeId) => ({
      chargeCar: null,
      chargePerAxle: '10.5000',
      chargePerAxleAutomatic: null,
      latitude: '-21.1000000',
      longitude: '-47.8000000',
      name: 'Praça SP-330',
      operator: 'CCR',
      osmNodeId,
    })),
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: 0,
    chargePerAxle: '10.5000',
    paymentMode: 'manual',
    total: '21.0000',
  }
}

describe('extractSeenTollBoothNodeIds (spec 095 item 4)', () => {
  test('answers empty when no trip has planned toll', () => {
    expect(extractSeenTollBoothNodeIds([])).toEqual([])
  })

  // Corrigir praça por onde ninguém passa é trabalho jogado fora — nunca as 166 do catálogo
  test('answers the distinct nodes across several trips, in first-seen order', () => {
    const result = extractSeenTollBoothNodeIds([plannedToll([111, 222]), plannedToll([222, 333])])

    expect(result).toEqual([111, 222, 333])
  })

  // planned_toll é fronteira: forma inesperada é ausência, nunca meio objeto (mesma regra do parser)
  test('ignores a row whose planned_toll has an unexpected shape', () => {
    const result = extractSeenTollBoothNodeIds([plannedToll([111]), { booths: 'not-an-array' }])

    expect(result).toEqual([111])
  })

  test('ignores a null planned_toll', () => {
    expect(extractSeenTollBoothNodeIds([null, plannedToll([111])])).toEqual([111])
  })
})
