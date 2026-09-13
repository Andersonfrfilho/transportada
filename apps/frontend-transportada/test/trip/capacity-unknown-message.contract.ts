/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveCapacityUnknownMessage } from '../../src/modules/trip/shared/capacityUnknownMessage.service'

const VEHICLE_ID = '44444444-4444-4444-8444-444444444441'

/**
 * Spec 147 D2/RF4/T5: cada motivo tem um texto e um destino próprios — nunca "capacidade
 * desconhecida" sem dizer o que falta e sem link para o lugar certo.
 */
describe('resolveCapacityUnknownMessage', () => {
  test('carroceria não informada leva à ficha do veículo que carrega', () => {
    const message = resolveCapacityUnknownMessage({
      reason: 'bodyTypeMissing',
      vehicleId: VEHICLE_ID,
    })

    expect(message.textKey).toBe('occupancy.capacityUnknownBodyType')
    expect(message.linkHref).toBe(`/fleet?vehicleId=${VEHICLE_ID}`)
    expect(message.linkLabelKey).toBe('cargoPlan.missingBedLink')
  })

  test('carreta não informada leva à ficha do cavalo, ainda sem carreta própria', () => {
    const message = resolveCapacityUnknownMessage({
      reason: 'trailerMissing',
      vehicleId: VEHICLE_ID,
    })

    expect(message.textKey).toBe('occupancy.capacityUnknownTrailer')
    expect(message.linkHref).toBe(`/fleet?vehicleId=${VEHICLE_ID}`)
    expect(message.linkLabelKey).toBe('cargoPlan.missingBedLink')
  })

  test('tipo sem linha de catálogo não tem link: nada na ficha resolveria', () => {
    const message = resolveCapacityUnknownMessage({
      reason: 'referenceMissing',
      vehicleId: VEHICLE_ID,
    })

    expect(message.textKey).toBe('occupancy.capacityUnknownReference')
    expect(message.linkHref).toBeNull()
    expect(message.linkLabelKey).toBeNull()
  })
})
