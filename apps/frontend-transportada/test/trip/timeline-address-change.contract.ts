/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 228 T4.1: origem e deslocamento do endereço corrigido, o ponto do endereço (sem
 * `locationState`) e a decisão do pino dos dois eventos novos. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import tripPt from '../../src/modules/trip/locales/trip.locale.json'
import {
  TRIP_TIMELINE_ADDRESS_CHANGE_ORIGINS,
  type TripTimelineItem,
  type TripTimelineKind,
} from '../../src/modules/trip/shared/trip.types'
import {
  formatTripTimelineDistance,
  hasTripTimelineExpandableDetail,
  resolveTimelineLocationView,
} from '../../src/modules/trip/shared/tripTimelineDetail.service'
import { resolveTripTimelineAddressChange } from '../../src/modules/trip/shared/tripTimelineAddressChange.service'
import { TIMELINE_MAP_CATEGORY_BY_KIND } from '../../src/modules/trip/shared/tripTimelineMap.constant'
import { resolveTimelineMapView } from '../../src/modules/trip/shared/tripTimelineMap.service'

const translate = (key: string, options?: Record<string, unknown>): string =>
  options === undefined
    ? key
    : `${key}(${Object.entries(options)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(',')})`

const POINT = {
  accuracyMeters: null,
  capturedAt: '2026-10-01T12:00:00.000Z',
  distanceMeters: null,
  latitude: -23.55,
  longitude: -46.63,
} as const

const ADDRESS_ITEM: TripTimelineItem = {
  actorName: 'Marina Alves',
  addressChange: { displacementMeters: 45, origin: 'operator' },
  channel: 'backoffice',
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'address-1',
  kind: 'stop.address_corrected',
  location: POINT,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-10-01T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: { id: 'stop-1', sequence: 2 },
  toStatus: null,
}

function located(
  id: string,
  occurredAt: string,
  kind: TripTimelineKind,
  latitude: number,
  longitude: number,
): TripTimelineItem {
  const withoutChange = withoutAddressChange(ADDRESS_ITEM)
  return {
    ...withoutChange,
    id,
    kind,
    location: { ...POINT, latitude, longitude },
    locationState: 'captured',
    occurredAt,
    stop: null,
  }
}

const PHOTO_ITEM = located(
  'photo-1',
  '2026-10-01T12:00:00.000Z',
  'document.canhoto_photo',
  -23.5,
  -46.6,
)

function withoutAddressChange(item: TripTimelineItem): TripTimelineItem {
  const copy: Record<string, unknown> = { ...item }
  delete copy['addressChange']
  return copy as TripTimelineItem
}

function lookup(dictionary: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      dictionary,
    )
}

describe('origem e deslocamento do endereço corrigido (spec 228 T4.1)', () => {
  it('só o endereço corrigido tem origem e deslocamento', () => {
    expect(resolveTripTimelineAddressChange(ADDRESS_ITEM, translate)).toEqual({
      displacement: 'eventTimeline.addressChange.displacement.meters(distance=45)',
      origin: 'eventTimeline.addressChange.origin.operator',
      summary:
        'eventTimeline.addressChange.summary(displacement=eventTimeline.addressChange.displacement.meters(distance=45),origin=eventTimeline.addressChange.origin.operator)',
    })
    expect(
      resolveTripTimelineAddressChange(
        { ...ADDRESS_ITEM, kind: 'document.canhoto_photo' },
        translate,
      ),
    ).toBeNull()
  })

  it('cada uma das quatro origens tem a sua frase', () => {
    for (const origin of TRIP_TIMELINE_ADDRESS_CHANGE_ORIGINS) {
      const change = resolveTripTimelineAddressChange(
        { ...ADDRESS_ITEM, addressChange: { displacementMeters: null, origin } },
        translate,
      )
      expect(change?.origin).toBe(`eventTimeline.addressChange.origin.${origin}`)
    }
  })

  it('sem deslocamento, a frase do deslocamento não existe', () => {
    const change = resolveTripTimelineAddressChange(
      { ...ADDRESS_ITEM, addressChange: { displacementMeters: null, origin: 'refinement' } },
      translate,
    )
    expect(change).toEqual({
      displacement: null,
      origin: 'eventTimeline.addressChange.origin.refinement',
      summary: 'eventTimeline.addressChange.origin.refinement',
    })
  })

  it('o deslocamento usa a unidade e o arredondamento da distância do resto do painel', () => {
    for (const meters of [45, 999, 1500, 12_400]) {
      const distance = formatTripTimelineDistance(meters)
      const change = resolveTripTimelineAddressChange(
        { ...ADDRESS_ITEM, addressChange: { displacementMeters: meters, origin: 'driver' } },
        translate,
      )
      expect(change?.displacement).toBe(
        `eventTimeline.addressChange.displacement.${distance.unit}(distance=${distance.value})`,
      )
    }
    expect(formatTripTimelineDistance(1500).unit).toBe('kilometers')
  })

  it('item sem addressChange (API antiga) não quebra nem inventa frase', () => {
    expect(
      resolveTripTimelineAddressChange(withoutAddressChange(ADDRESS_ITEM), translate),
    ).toBeNull()
  })

  it('pt-BR e en têm as seis chaves, acentuadas em pt-BR', () => {
    const paths = [
      ...TRIP_TIMELINE_ADDRESS_CHANGE_ORIGINS.map(
        (origin) => `eventTimeline.addressChange.origin.${origin}`,
      ),
      'eventTimeline.addressChange.displacement.meters',
      'eventTimeline.addressChange.displacement.kilometers',
    ]
    for (const path of paths) {
      expect([path, typeof lookup(tripPt, path)]).toEqual([path, 'string'])
      expect([path, typeof lookup(tripEn, path)]).toEqual([path, 'string'])
    }
    expect(lookup(tripPt, 'eventTimeline.addressChange.origin.operator')).toBe(
      'Corrigido pelo escritório',
    )
    expect(lookup(tripPt, 'eventTimeline.addressChange.origin.refinement')).toBe(
      'Refino de precisão',
    )
  })
})

describe('o rótulo do pino do endereço (spec 228 M1)', () => {
  it('o mapa expandido escolhe o rótulo do ponto novo quando o pino é address', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/trip/components/TripTimelineLocationMap.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toMatch(/pin === 'address' \? 'addressPin' : 'eventPin'/u)
  })
})

describe('o ponto do endereço corrigido não tem locationState (spec 228 D7)', () => {
  it('com ponto novo, é posição legível e abre o mapa', () => {
    const view = resolveTimelineLocationView(ADDRESS_ITEM, translate)
    expect(view?.kind).toBe('captured')
    expect(view?.canViewMap).toBe(true)
    expect(view?.coordinates).toEqual({ latitude: -23.55, longitude: -46.63 })
    expect(hasTripTimelineExpandableDetail(ADDRESS_ITEM)).toBe(true)
  })

  it('o ponto do endereço é do tipo address, com "Corrigido em" no lugar de "Lida em" (M1)', () => {
    const view = resolveTimelineLocationView(ADDRESS_ITEM, translate)
    expect(view?.pin).toBe('address')
    expect(view?.lines.at(-1)).toStartWith('eventTimeline.location.addressCorrectedAt(')
    expect(view?.tooltip).not.toContain('eventTimeline.location.capturedAt')
  })

  it('a posição do aparelho (foto) continua do tipo device, com "Lida em" (M1)', () => {
    const photo: TripTimelineItem = {
      ...withoutAddressChange(ADDRESS_ITEM),
      kind: 'document.canhoto_photo',
      locationState: 'captured',
    }
    const view = resolveTimelineLocationView(photo, translate)
    expect(view?.pin).toBe('device')
    expect(view?.lines.at(-1)).toStartWith('eventTimeline.location.capturedAt(')
  })

  it('pt-BR e en têm as quatro chaves do ponto do endereço, acentuadas em pt-BR (M1)', () => {
    const paths = [
      'eventTimeline.location.addressPin',
      'eventTimeline.location.addressCorrectedAt',
      'eventTimeline.location.legendAddress',
      'eventTimeline.location.legendAddressEventOnly',
      'eventTimeline.addressChange.summary',
    ]
    for (const path of paths) {
      expect([path, typeof lookup(tripPt, path)]).toEqual([path, 'string'])
      expect([path, typeof lookup(tripEn, path)]).toEqual([path, 'string'])
    }
    expect(lookup(tripPt, 'eventTimeline.location.addressPin')).toBe('Novo ponto do endereço')
    expect(lookup(tripPt, 'eventTimeline.location.addressCorrectedAt')).toBe(
      'Corrigido em {{moment}}',
    )
  })

  it('sem ponto (refino, ou sem trip.event-location), não há view nem detalhe', () => {
    const item = { ...ADDRESS_ITEM, location: null }
    expect(resolveTimelineLocationView(item, translate)).toBeNull()
    expect(hasTripTimelineExpandableDetail(item)).toBe(false)
  })

  it('a exceção é só do endereço: outro kind sem locationState continua sem posição', () => {
    const item: TripTimelineItem = { ...ADDRESS_ITEM, kind: 'stop.arrived' }
    expect(resolveTimelineLocationView(item, translate)).toBeNull()
    expect(hasTripTimelineExpandableDetail(item)).toBe(false)
  })

  it('a foto do canhoto sem permissão de posição mantém o estado e não abre mapa', () => {
    const photo: TripTimelineItem = {
      ...withoutAddressChange(ADDRESS_ITEM),
      kind: 'document.canhoto_photo',
      location: null,
      locationState: 'captured',
    }
    expect(resolveTimelineLocationView(photo, translate)?.canViewMap).toBe(false)
    expect(hasTripTimelineExpandableDetail(photo)).toBe(false)
  })
})

describe('o pino dos eventos novos (spec 228 T4.1, decisão registrada no evidence.md)', () => {
  it('a foto do canhoto reaproveita a cor da entrega e o endereço fica fora do mapa (null explícito)', () => {
    expect(TIMELINE_MAP_CATEGORY_BY_KIND['document.canhoto_photo']).toBe('delivered')
    expect(Object.hasOwn(TIMELINE_MAP_CATEGORY_BY_KIND, 'stop.address_corrected')).toBe(true)
    expect(TIMELINE_MAP_CATEGORY_BY_KIND['stop.address_corrected']).toBeNull()
  })

  it('o endereço corrigido, com ponto ou sem, não é pino, contagem nem falta no mapa da viagem (M2)', () => {
    const view = resolveTimelineMapView(
      [ADDRESS_ITEM, { ...ADDRESS_ITEM, id: 'address-2', location: null }],
      translate,
    )
    expect(view.locatedCount).toBe(0)
    expect(view.points).toHaveLength(0)
    expect(view.categories).toEqual([])
    expect(view.missingCount).toBe(0)
  })

  it('o endereço no meio de dois pinos não vira pino, nem ganha "X min do anterior" (M2)', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-10-01T12:00:00.000Z', 'stop.arrived', -23.55, -46.63),
        { ...ADDRESS_ITEM, occurredAt: '2026-10-01T12:30:00.000Z' },
        located('b', '2026-10-01T13:00:00.000Z', 'stop.departed', -23.56, -46.64),
      ],
      translate,
    )
    expect(view.points.map((point) => point.order)).toEqual([1, 2])
    expect(view.points[1]?.minutesFromPrevious).toBe(60)
    expect(view.categories.map(({ category }) => category)).toEqual(['arrived', 'departed'])
  })

  it('foto isolada vira pino da câmera com rótulo próprio e não conta como entrega (M4)', () => {
    const view = resolveTimelineMapView([PHOTO_ITEM], translate)
    expect(view.points).toHaveLength(1)
    expect(view.points[0]).toMatchObject({
      category: 'delivered',
      icon: 'camera',
      label: 'eventTimeline.itemTitle.canhotoPhotoUnknownDocument',
    })
    expect(view.categories).toEqual([])
  })

  it('foto fundida com a entrega continua num pino de entrega e a legenda conta uma só (M4)', () => {
    const view = resolveTimelineMapView(
      [
        { ...PHOTO_ITEM, occurredAt: '2026-10-01T12:05:00.000Z' },
        {
          ...PHOTO_ITEM,
          id: 'delivered-1',
          kind: 'document.delivered',
          occurredAt: '2026-10-01T12:00:00.000Z',
        },
      ],
      translate,
    )
    expect(view.points).toHaveLength(1)
    expect(view.points[0]).toMatchObject({
      count: 2,
      icon: 'check',
      label: 'eventTimeline.map.category.delivered',
    })
    expect(view.categories).toEqual([{ category: 'delivered', count: 1 }])
  })
})
