/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import {
  hasTripTimelineExpandableDetail,
  resolveTimelineLocationView,
} from '../../src/modules/trip/shared/tripTimelineDetail.service'

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

function fakeTranslate(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key
  const entries = Object.entries(options)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',')
  return `${key}(${entries})`
}

const TIMELINE_ITEM: TripTimelineItem = {
  ...BASE_ITEM,
  stop: { id: 'stop-1', sequence: 1 },
}

const READING = { ...CAPTURED_LOCATION, accuracyMeters: 12.4 }

/**
 * Spec 196 T6.1 / ADR-0081 §6.1: as cinco situações que o serviço decide — o componente só desenha
 * o que ele devolve. Coordenada sintética (-23.55 / -46.63).
 */
describe('resolveTimelineLocationView (spec 196 T6.1)', () => {
  it('captured com coordenada: ícone neutro, tooltip na ordem precisão, distância, coordenada, hora, e Ver no mapa', () => {
    const view = resolveTimelineLocationView(
      { ...TIMELINE_ITEM, location: READING, locationState: 'captured' },
      fakeTranslate,
    )

    expect(view).not.toBeNull()
    expect(view?.kind).toBe('captured')
    expect(view?.tone).toBe('neutral')
    expect(view?.icon).toBe('map-pin')
    expect(view?.canViewMap).toBe(true)
    expect(view?.coordinates).toEqual({ latitude: -23.55, longitude: -46.63 })
    expect(view?.lines).toHaveLength(4)
    expect(view?.lines[0]).toBe('eventTimeline.location.accuracy(meters=12)')
    expect(view?.lines[1]).toBe('eventTimeline.location.distance(meters=1)')
    expect(view?.lines[2]).toBe(
      'eventTimeline.location.coordinates(latitude=-23.55000,longitude=-46.63000)',
    )
    expect(view?.lines[3]?.startsWith('eventTimeline.location.capturedAt(moment=')).toBe(true)
  })

  it('captured omite a linha de precisão quando ela é nula, e a de distância quando ela é nula', () => {
    const view = resolveTimelineLocationView(
      {
        ...TIMELINE_ITEM,
        location: { ...READING, accuracyMeters: null, distanceMeters: null },
        locationState: 'captured',
      },
      fakeTranslate,
    )

    expect(view?.lines).toHaveLength(2)
    expect(view?.lines[0]?.startsWith('eventTimeline.location.coordinates(')).toBe(true)
    expect(view?.lines[1]?.startsWith('eventTimeline.location.capturedAt(')).toBe(true)
  })

  it('captured sem coordenada (leitor sem trip.event-location): neutro, sem número e sem Ver no mapa', () => {
    const view = resolveTimelineLocationView(
      { ...TIMELINE_ITEM, location: null, locationState: 'captured' },
      fakeTranslate,
    )

    expect(view?.kind).toBe('restricted')
    expect(view?.tone).toBe('neutral')
    expect(view?.icon).toBe('map-pin')
    expect(view?.canViewMap).toBe(false)
    expect(view?.coordinates).toBeNull()
    expect(view?.lines).toEqual(['eventTimeline.location.restricted'])
    expect(view?.tooltip).not.toMatch(/\d/)
  })

  it('unavailable: o único estado vermelho, ícone de GPS cortado, sem número e sem Ver no mapa', () => {
    const view = resolveTimelineLocationView(
      { ...TIMELINE_ITEM, location: null, locationState: 'unavailable' },
      fakeTranslate,
    )

    expect(view?.kind).toBe('unavailable')
    expect(view?.tone).toBe('problem')
    expect(view?.icon).toBe('map-pin-off')
    expect(view?.canViewMap).toBe(false)
    expect(view?.coordinates).toBeNull()
    expect(view?.lines).toEqual(['eventTimeline.location.unavailable'])
  })

  it('unavailable no canal do WhatsApp também é vermelho, sem número', () => {
    const view = resolveTimelineLocationView(
      { ...TIMELINE_ITEM, channel: 'whatsapp', location: null, locationState: 'unavailable' },
      fakeTranslate,
    )

    expect(view?.tone).toBe('problem')
    expect(view?.canViewMap).toBe(false)
  })

  it('expired: neutro — nunca vermelho —, com a frase dos 90 dias e sem Ver no mapa', () => {
    const view = resolveTimelineLocationView(
      { ...TIMELINE_ITEM, location: null, locationState: 'expired' },
      fakeTranslate,
    )

    expect(view?.kind).toBe('expired')
    expect(view?.tone).toBe('neutral')
    expect(view?.canViewMap).toBe(false)
    expect(view?.lines).toEqual(['eventTimeline.location.expired'])
  })

  it('locationState nulo ou ausente não desenha nada', () => {
    expect(
      resolveTimelineLocationView(
        { ...TIMELINE_ITEM, location: null, locationState: null },
        fakeTranslate,
      ),
    ).toBeNull()
    expect(resolveTimelineLocationView(TIMELINE_ITEM, fakeTranslate)).toBeNull()
  })

  it('locationState nulo não desenha nem se vier uma coordenada perdida', () => {
    expect(
      resolveTimelineLocationView(
        { ...TIMELINE_ITEM, location: READING, locationState: null },
        fakeTranslate,
      ),
    ).toBeNull()
  })
})

describe('hasTripTimelineExpandableDetail com posição (spec 196 T6.1)', () => {
  it('conta captured com coordenada', () => {
    expect(
      hasTripTimelineExpandableDetail({
        ...TIMELINE_ITEM,
        location: READING,
        locationState: 'captured',
      }),
    ).toBe(true)
  })

  it('não conta captured sem coordenada, unavailable, expired nem nulo', () => {
    for (const locationState of ['captured', 'unavailable', 'expired', null] as const) {
      expect(
        hasTripTimelineExpandableDetail({ ...TIMELINE_ITEM, location: null, locationState }),
      ).toBe(false)
    }
  })
})
