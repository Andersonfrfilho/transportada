/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { buildOccurrenceTripMapView } from '../../src/modules/trip/shared/occurrenceTripMap.service'
import type {
  TripStopDetail,
  TripTimelineItem,
  TripTimelineKind,
  TripTimelineLocationState,
} from '../../src/modules/trip/shared/trip.types'

const translate = (key: string, options?: Record<string, unknown>): string =>
  options === undefined ? key : `${key}|${JSON.stringify(options)}`

const BASE_ITEM: TripTimelineItem = {
  actorName: null,
  channel: null,
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item',
  kind: 'stop.arrived',
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-10-10T10:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: null,
}

function event(
  id: string,
  kind: TripTimelineKind,
  occurredAt: string,
  position: null | Readonly<{
    distanceMeters?: null | number
    latitude: number
    longitude: number
  }>,
  state: null | TripTimelineLocationState = 'captured',
): TripTimelineItem {
  return {
    ...BASE_ITEM,
    id,
    kind,
    location:
      position === null
        ? null
        : {
            accuracyMeters: 5,
            capturedAt: occurredAt,
            distanceMeters: position.distanceMeters ?? null,
            latitude: position.latitude,
            longitude: position.longitude,
          },
    locationState: state,
    occurredAt,
    stop: { id: 'stop-2', sequence: 2 },
  }
}

function stop(id: string, sequence: number, label: string, latitude?: string): TripStopDetail {
  return {
    addressKey: `key-${id}`,
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id,
    label,
    ...(latitude === undefined ? {} : { latitude, longitude: '-47.5' }),
    sequence,
  }
}

const STOPS = [stop('stop-1', 1, 'Armazém A', '-21.1'), stop('stop-2', 2, 'Loja B', '-21.2')]

const ITEMS = [
  event('arrived-1', 'stop.arrived', '2026-10-10T09:00:00.000Z', {
    distanceMeters: 35,
    latitude: -21.2,
    longitude: -47.5,
  }),
  event('delivered-1', 'document.delivered', '2026-10-10T11:00:00.000Z', {
    distanceMeters: 1500,
    latitude: -21.20005,
    longitude: -47.50005,
  }),
  event('occ-1', 'document.occurrence', '2026-10-10T10:00:00.000Z', {
    distanceMeters: 12,
    latitude: -21.2002,
    longitude: -47.4,
  }),
  event('unavailable-1', 'stop.departed', '2026-10-10T12:00:00.000Z', null, 'unavailable'),
  event('expired-1', 'document.canhoto_photo', '2026-10-10T12:30:00.000Z', null, 'expired'),
  { ...BASE_ITEM, id: 'status-1', kind: 'trip.status_changed' as const },
]

function view(overrides: Partial<Parameters<typeof buildOccurrenceTripMapView>[0]> = {}) {
  return buildOccurrenceTripMapView({
    canViewEventLocation: true,
    formatMoment: (value) => `m(${value})`,
    items: ITEMS,
    occurrence: { id: 'occ-1', stopLabel: 'Loja B', tripDocumentId: null },
    stops: STOPS,
    translate,
    ...overrides,
  })
}

describe('o mapa da viagem na ocorrência: serviço puro', () => {
  it('numera os eventos com posição pela ordem do tempo, não pela ordem da API', () => {
    const { entries } = view()
    const located = entries.filter((entry) => entry.order !== null)

    expect(located.map((entry) => [entry.id, entry.order])).toEqual([
      ['arrived-1', 1],
      ['occ-1', 2],
      ['delivered-1', 3],
    ])
  })

  it('destaca a ocorrência da página e só ela, pelo id', () => {
    const { entries, pins } = view()

    expect(entries.filter((entry) => entry.isThisOccurrence).map((entry) => entry.id)).toEqual([
      'occ-1',
    ])
    expect(pins.filter((pin) => pin.isHighlighted === true)).toHaveLength(1)
    expect(pins.at(-1)?.isHighlighted).toBe(true)
    expect(view().occurrenceState).toBe('located')
  })

  it('um evento com o mesmo id mas de outro tipo não é a ocorrência', () => {
    const items = [
      event('occ-1', 'document.delivered', '2026-10-10T10:00:00.000Z', null, 'unavailable'),
    ]

    expect(view({ items }).occurrenceState).toBe('not-found')
  })

  it('cada pino leva ícone, selo de ordem, cor por tipo e dica com rótulo, hora e distância', () => {
    const arrived = view().pins.find((pin) => pin.orderBadge === '1')

    expect(arrived?.glyph).toBe('map-pin')
    expect(arrived?.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(arrived?.popup).toEqual([
      '1. eventTimeline.map.category.arrived',
      'm(2026-10-10T09:00:00.000Z)',
      'occurrenceTripMap.distance.meters|{"distance":"35"}',
    ])
  })

  it('a distância sai em quilômetros acima de 1 km e some quando a API não a entrega', () => {
    const { entries } = view()

    expect(entries.find((entry) => entry.id === 'delivered-1')?.detail).toContain('kilometers')
    const withoutDistance = view({
      items: [
        event('occ-1', 'stop.occurrence', '2026-10-10T10:00:00.000Z', {
          latitude: -21.2,
          longitude: -47.5,
        }),
      ],
    })
    expect(withoutDistance.entries[0]?.detail).toBeNull()
    expect(withoutDistance.pins.find((pin) => pin.isHighlighted === true)?.popup).toHaveLength(2)
  })

  it('evento sem posição não vira pino e é nomeado com o motivo', () => {
    const { entries, pins, withoutPositionCount } = view()
    const without = entries.filter((entry) => entry.order === null)

    expect(without.map((entry) => [entry.id, entry.position])).toEqual([
      ['unavailable-1', 'unavailable'],
      ['expired-1', 'expired'],
    ])
    expect(without.map((entry) => entry.detail)).toEqual([
      'occurrenceTripMap.withoutPosition.unavailable',
      'occurrenceTripMap.withoutPosition.expired',
    ])
    expect(withoutPositionCount).toBe(2)
    expect(pins.filter((pin) => pin.glyph !== undefined)).toHaveLength(3)
  })

  it('leitor sem coordenada (restricted) cai na legenda como sem posição, sem pino', () => {
    const items = [event('arrived-1', 'stop.arrived', '2026-10-10T09:00:00.000Z', null, 'captured')]
    const { entries, pins } = view({ items })

    expect(entries[0]?.position).toBe('restricted')
    expect(pins.every((pin) => pin.glyph === undefined)).toBe(true)
  })

  it('evento que não se aplica (status, tripulação) não aparece nem como pendência', () => {
    expect(view().entries.some((entry) => entry.id === 'status-1')).toBe(false)
  })

  it('a parada da nota sai do evento, e é o único pino de parada com permissão', () => {
    const { noteStop, pins, stopCount } = view()

    expect(noteStop).toEqual({
      label: 'Loja B',
      pinKey: 'occurrence-map-stop-stop-2',
      sequence: 2,
    })
    expect(stopCount).toBe(1)
    expect(pins.filter((pin) => pin.glyph === undefined).map((pin) => pin.label)).toEqual([
      'Loja B',
    ])
  })

  it('sem o evento da ocorrência, a parada sai pelo vínculo da nota e depois pelo rótulo', () => {
    const linked: TripStopDetail = {
      ...stop('stop-3', 3, 'Outra loja', '-21.3'),
      documents: [{ id: 'doc-9' } as unknown as TripStopDetail['documents'][number]],
    }
    const byDocument = view({
      items: [],
      occurrence: { id: 'occ-1', stopLabel: null, tripDocumentId: 'doc-9' },
      stops: [...STOPS, linked],
    })
    const byLabel = view({ items: [] })

    expect(byDocument.noteStop?.sequence).toBe(3)
    expect(byLabel.noteStop?.sequence).toBe(2)
    expect(byLabel.occurrenceState).toBe('not-found')
  })

  it('parada da nota sem coordenada é nomeada e não vira pino', () => {
    const { noteStop, stopCount } = view({
      items: [],
      stops: [stop('stop-2', 2, 'Loja B')],
    })

    expect(noteStop).toEqual({ label: 'Loja B', pinKey: null, sequence: 2 })
    expect(stopCount).toBe(0)
  })

  it('sem trip.event-location nenhuma coordenada de evento chega ao mapa, mesmo se a API a mandar', () => {
    const { entries, mode, pins } = view({ canViewEventLocation: false })

    expect(mode).toBe('stopsOnly')
    expect(entries).toEqual([])
    expect(pins.map((pin) => pin.label)).toEqual(['Armazém A', 'Loja B'])
    expect(pins.every((pin) => pin.glyph === undefined && pin.orderBadge === undefined)).toBe(true)
    expect(pins.filter((pin) => pin.isHighlighted === true).map((pin) => pin.label)).toEqual([
      'Loja B',
    ])
    const coordinates = pins.flatMap((pin) => [pin.latitude, pin.longitude])
    expect(coordinates).not.toContain(-21.2002)
  })

  it('eventos a poucos metros partilham a ancoragem, para o mapa abri-los em leque', () => {
    const { pins } = view()
    const anchored = pins.filter((pin) => pin.glyph !== undefined && pin.latitude === -21.2)

    expect(anchored).toHaveLength(2)
    expect(new Set(pins.map((pin) => pin.stopKey)).size).toBe(pins.length)
  })

  it('a legenda lista só os tipos que têm pino', () => {
    expect(view().categories).toEqual(['arrived', 'occurrence', 'delivered'])
  })
})
