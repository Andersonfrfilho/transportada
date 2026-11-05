/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF8: a próxima parada oferecida é a mesma que o "saí" escolheria.
 */
import { describe, expect, test } from 'bun:test'

import type { NextStopCandidate } from '../../src/trips/application/driver-next-stop.types.js'
import { resolveNextStop } from '../../src/trips/application/resolve-next-stop.service.js'

function buildStop(
  overrides: Partial<NextStopCandidate> & { readonly sequence: number },
): NextStopCandidate {
  return {
    address: `Rua ${overrides.sequence}`,
    arrivedAt: null,
    completedAt: null,
    documents: [{ id: `doc-${overrides.sequence}`, number: '100', separationStatus: 'loaded' }],
    enRouteSince: null,
    id: `stop-${overrides.sequence}`,
    latitude: '-23.55',
    longitude: '-46.63',
    precision: 'rooftop',
    recipientName: 'Cliente',
    ...overrides,
  }
}

describe('resolveNextStop (spec 294 RF8)', () => {
  test('escolhe a primeira pendente do roteiro e leva a confiança e o total', () => {
    const next = resolveNextStop({
      stops: [
        buildStop({ arrivedAt: 'x', completedAt: 'x', sequence: 1 }),
        buildStop({ latitude: null, longitude: null, precision: null, sequence: 3 }),
        buildStop({ sequence: 2 }),
      ],
      totalStops: 3,
    })

    expect(next).toEqual({
      address: 'Rua 2',
      coordinate: { latitude: '-23.55', longitude: '-46.63' },
      documents: [{ id: 'doc-2', number: '100' }],
      id: 'stop-2',
      isAddressReliable: true,
      precision: 'rooftop',
      recipientName: 'Cliente',
      sequence: 2,
      totalStops: 3,
    })
  })

  test('sem coordenada, a coordenada sai nula e o endereço não é confiável', () => {
    const next = resolveNextStop({
      stops: [buildStop({ latitude: null, longitude: null, precision: null, sequence: 2 })],
      totalStops: 2,
    })

    expect(next?.coordinate).toBeNull()
    expect(next?.isAddressReliable).toBe(false)
  })

  test('nenhuma pendente devolve nulo', () => {
    const next = resolveNextStop({
      stops: [buildStop({ arrivedAt: 'x', completedAt: 'x', sequence: 1 })],
      totalStops: 1,
    })

    expect(next).toBeNull()
  })
})
