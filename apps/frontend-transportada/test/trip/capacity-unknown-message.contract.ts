/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveCapacityUnknownMessage } from '../../src/modules/trip/shared/capacityUnknownMessage.service'

const VEHICLE_ID = '44444444-4444-4444-8444-444444444441'

/**
 * Spec 147 D2/RF4/T5: cada motivo tem um texto e um destino próprios — nunca "capacidade
 * desconhecida" sem dizer o que falta e sem link para o lugar certo.
 */
const TRAILER_ID = '55555555-5555-4555-8555-555555555552'

describe('resolveCapacityUnknownMessage', () => {
  test('carroceria não informada leva à ficha do veículo que carrega, sem carreta', () => {
    const message = resolveCapacityUnknownMessage({
      reason: 'bodyTypeMissing',
      vehicleId: VEHICLE_ID,
    })

    expect(message.textKey).toBe('occupancy.capacityUnknownBodyType')
    expect(message.linkHref).toBe(`/fleet?vehicleId=${VEHICLE_ID}`)
    expect(message.linkLabelKey).toBe('cargoPlan.missingBedLink')
  })

  /**
   * T18 (revisão, item 10): com carreta atrelada e sem carroceria cadastrada nela, o link tem de
   * levar à ficha **dela**, não à do cavalo — é a ficha da carreta que falta preencher.
   */
  test('carroceria não informada com carreta atrelada leva à ficha da carreta, não do cavalo', () => {
    const message = resolveCapacityUnknownMessage({
      capacityUnknownVehicleId: TRAILER_ID,
      reason: 'bodyTypeMissing',
      vehicleId: VEHICLE_ID,
    })

    expect(message.linkHref).toBe(`/fleet?vehicleId=${TRAILER_ID}`)
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
