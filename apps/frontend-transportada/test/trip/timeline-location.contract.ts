/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const ISO_INSTANT = '2026-09-18T12:00:00.000Z'

const BASE_ITEM = {
  actorName: 'Marina Alves',
  channel: 'office' as const,
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item-1',
  kind: 'trip.status_changed' as const,
  occurrence: null,
  occurredAt: ISO_INSTANT,
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: 'in_transit',
}

const CAPTURED_LOCATION = {
  accuracyMeters: 12.5,
  capturedAt: ISO_INSTANT,
  distanceMeters: 1,
  latitude: -23.55,
  longitude: -46.63,
}

function readPage(item: Record<string, unknown>): unknown {
  return adapters.tripTimelineFromApi({ items: [item], nextCursor: null })
}

/**
 * Spec 196 RF9/RF10 (T4.0): o painel tolera `location`/`locationState` antes de a API mandá-los, e
 * segue recusando qualquer outra chave — o validador é estrito.
 */
describe('localização no item da linha do tempo (spec 196 T4.0)', () => {
  it('aceita o item sem as duas chaves', () => {
    expect(() => readPage(BASE_ITEM)).not.toThrow()
  })

  it('aceita o item com as duas chaves preenchidas', () => {
    expect(() =>
      readPage({ ...BASE_ITEM, location: CAPTURED_LOCATION, locationState: 'captured' }),
    ).not.toThrow()
  })

  it('aceita accuracyMeters nulo', () => {
    expect(() =>
      readPage({
        ...BASE_ITEM,
        location: { ...CAPTURED_LOCATION, accuracyMeters: null },
        locationState: 'captured',
      }),
    ).not.toThrow()
  })

  it('aceita distanceMeters nulo — a parada pode não ter ponto de referência', () => {
    expect(() =>
      readPage({
        ...BASE_ITEM,
        location: { ...CAPTURED_LOCATION, distanceMeters: null },
        locationState: 'captured',
      }),
    ).not.toThrow()
  })

  it('recusa accuracyMeters e distanceMeters negativos', () => {
    expect(() =>
      readPage({
        ...BASE_ITEM,
        location: { ...CAPTURED_LOCATION, accuracyMeters: -1 },
        locationState: 'captured',
      }),
    ).toThrow()
    expect(() =>
      readPage({
        ...BASE_ITEM,
        location: { ...CAPTURED_LOCATION, distanceMeters: -1 },
        locationState: 'captured',
      }),
    ).toThrow()
  })

  it('aceita location nulo com locationState unavailable', () => {
    expect(() =>
      readPage({ ...BASE_ITEM, location: null, locationState: 'unavailable' }),
    ).not.toThrow()
  })

  it('aceita locationState nulo e expired', () => {
    expect(() => readPage({ ...BASE_ITEM, location: null, locationState: null })).not.toThrow()
    expect(() => readPage({ ...BASE_ITEM, location: null, locationState: 'expired' })).not.toThrow()
  })

  it('continua recusando chave desconhecida', () => {
    expect(() => readPage({ ...BASE_ITEM, actorUserId: 'user-1' })).toThrow()
  })

  it('recusa locationState fora do conjunto', () => {
    expect(() => readPage({ ...BASE_ITEM, locationState: 'denied' })).toThrow()
  })

  it('recusa location com chave a mais ou coordenada em texto', () => {
    expect(() =>
      readPage({ ...BASE_ITEM, location: { ...CAPTURED_LOCATION, altitude: 1 } }),
    ).toThrow()
    expect(() =>
      readPage({ ...BASE_ITEM, location: { ...CAPTURED_LOCATION, latitude: '-23.55' } }),
    ).toThrow()
  })
})
