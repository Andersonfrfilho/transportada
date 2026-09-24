/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

/**
 * Spec 185 T6.1 (RF2/RF3): as três respostas que passam a carregar `autoDispatch` opcional —
 * carregar nota (linha), carregar em lote, e registrar ocorrência de separação. Ausente é o caso
 * comum (carga ainda não fechou); presente segue `{ outcome: 'dispatched' }` ou
 * `{ outcome: 'blocked', code, details? }`.
 */
const TRANSITION_BASE = {
  document: {
    createdAt: '2026-09-24T10:00:00.000Z',
    deliveredAt: null,
    destinationOrigin: null,
    freightCalculationId: null,
    id: 'document-1',
    loadedAt: '2026-09-24T11:00:00.000Z',
    nfeDocumentId: 'nfe-1',
    releasedAt: null,
    returnedAt: null,
    returnReason: null,
    separatedAt: '2026-09-24T10:30:00.000Z',
    separationStatus: 'loaded',
    stopId: 'stop-1',
    tripId: 'trip-1',
    updatedAt: '2026-09-24T11:00:00.000Z',
  },
  tripStatus: 'loading',
} as const

const BATCH_BASE = {
  items: [{ documentId: 'document-1', outcome: 'applied' }],
  tripStatus: 'loading',
} as const

describe('transitionTripDocumentResultFromApi lê autoDispatch (spec 185 T6.1)', () => {
  test('ausente segue funcionando — API anterior ao gatilho', () => {
    const adapters = createTripResponseAdapters()

    const result = adapters.transitionTripDocumentResultFromApi({ ...TRANSITION_BASE })

    expect(result.autoDispatch).toBeUndefined()
  })

  test('dispatched chega intacto', () => {
    const adapters = createTripResponseAdapters()

    const result = adapters.transitionTripDocumentResultFromApi({
      ...TRANSITION_BASE,
      autoDispatch: { outcome: 'dispatched' },
    })

    expect(result.autoDispatch).toEqual({ outcome: 'dispatched' })
  })

  test('blocked com stopIds chega intacto', () => {
    const adapters = createTripResponseAdapters()

    const result = adapters.transitionTripDocumentResultFromApi({
      ...TRANSITION_BASE,
      autoDispatch: {
        code: 'TRIP_HAS_UNSCHEDULED_STOPS',
        details: { stopIds: ['stop-1'] },
        outcome: 'blocked',
      },
    })

    expect(result.autoDispatch).toEqual({
      code: 'TRIP_HAS_UNSCHEDULED_STOPS',
      details: { stopIds: ['stop-1'] },
      outcome: 'blocked',
    })
  })

  test('código fora do vocabulário recusa a resposta inteira', () => {
    const adapters = createTripResponseAdapters()

    expect(() =>
      adapters.transitionTripDocumentResultFromApi({
        ...TRANSITION_BASE,
        autoDispatch: { code: 'TRIP_QUALQUER_COISA', outcome: 'blocked' },
      }),
    ).toThrow()
  })
})

describe('batchStatusResultFromApi lê autoDispatch (spec 185 T6.1)', () => {
  test('ausente segue funcionando', () => {
    const adapters = createTripResponseAdapters()

    expect(adapters.batchStatusResultFromApi({ ...BATCH_BASE }).autoDispatch).toBeUndefined()
  })

  test('dispatched chega intacto', () => {
    const adapters = createTripResponseAdapters()

    const result = adapters.batchStatusResultFromApi({
      ...BATCH_BASE,
      autoDispatch: { outcome: 'dispatched' },
    })

    expect(result.autoDispatch).toEqual({ outcome: 'dispatched' })
  })
})
