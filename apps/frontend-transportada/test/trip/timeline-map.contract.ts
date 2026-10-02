/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { TripTimelineItem, TripTimelineKind } from '../../src/modules/trip/shared/trip.types'
import {
  TIMELINE_MAP_CATEGORIES,
  TIMELINE_MAP_CATEGORY_BY_KIND,
  TIMELINE_MAP_ICON_BY_CATEGORY,
} from '../../src/modules/trip/shared/tripTimelineMap.constant'
import { resolveTimelineMapView } from '../../src/modules/trip/shared/tripTimelineMap.service'
import { TRIP_TIMELINE_KINDS } from '../../src/modules/trip/shared/trip.types'

const translate = (key: string): string => key

const BASE_ITEM: TripTimelineItem = {
  actorName: 'Marina Alves',
  channel: 'office',
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item-1',
  kind: 'trip.status_changed',
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-09-18T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: 'in_transit',
}

function located(
  id: string,
  occurredAt: string,
  kind: TripTimelineKind,
  latitude: number,
  longitude: number,
): TripTimelineItem {
  return {
    ...BASE_ITEM,
    id,
    kind,
    location: {
      accuracyMeters: 5,
      capturedAt: occurredAt,
      distanceMeters: null,
      latitude,
      longitude,
    },
    locationState: 'captured',
    occurredAt,
  }
}

describe('minimapa da linha do tempo (spec 196)', () => {
  it('cobre todos os tipos de evento com categoria e ícone', () => {
    for (const kind of TRIP_TIMELINE_KINDS) {
      const category = TIMELINE_MAP_CATEGORY_BY_KIND[kind]
      expect(TIMELINE_MAP_CATEGORIES).toContain(category)
      expect(TIMELINE_MAP_ICON_BY_CATEGORY[category]).toBeTruthy()
    }
  })

  it('zero eventos: vista vazia, sem pontos', () => {
    const view = resolveTimelineMapView([], translate)
    expect(view.points).toHaveLength(0)
    expect(view.locatedCount).toBe(0)
    expect(view.missingCount).toBe(0)
  })

  it('ignora o item sem locationState (null e ausente) sem contar como falta', () => {
    const view = resolveTimelineMapView(
      [BASE_ITEM, { ...BASE_ITEM, id: 'b', locationState: null }],
      translate,
    )
    expect(view.points).toHaveLength(0)
    expect(view.missingCount).toBe(0)
  })

  it('captured com coordenada vira ponto com ícone e categoria do tipo', () => {
    const view = resolveTimelineMapView(
      [located('a', '2026-09-18T12:00:00.000Z', 'document.delivered', -23.55, -46.63)],
      translate,
    )
    expect(view.points).toHaveLength(1)
    expect(view.points[0]).toMatchObject({
      category: 'delivered',
      count: 1,
      icon: 'check',
      order: 1,
    })
    expect(view.points[0]?.label).toBe('eventTimeline.map.category.delivered')
  })

  it('unavailable, expired e captured sem coordenada ficam de fora e são contados à parte', () => {
    const view = resolveTimelineMapView(
      [
        { ...BASE_ITEM, id: 'u', locationState: 'unavailable' },
        { ...BASE_ITEM, id: 'e', locationState: 'expired' },
        { ...BASE_ITEM, id: 'r', locationState: 'captured' },
        { ...BASE_ITEM, id: 'r2', location: null, locationState: 'captured' },
      ],
      translate,
    )
    expect(view.points).toHaveLength(0)
    expect(view.missing).toEqual({ expired: 1, restricted: 2, unavailable: 1 })
    expect(view.missingCount).toBe(4)
  })

  it('ordena do mais antigo ao mais novo, mesmo recebendo do mais novo ao mais antigo', () => {
    const view = resolveTimelineMapView(
      [
        located('c', '2026-09-18T15:00:00.000Z', 'document.delivered', -23.5, -46.6),
        located('b', '2026-09-18T13:00:00.000Z', 'stop.arrived', -23.6, -46.7),
        located('a', '2026-09-18T11:00:00.000Z', 'trip.dispatched', -23.7, -46.8),
      ],
      translate,
    )
    expect(view.points.map((point) => point.category)).toEqual([
      'dispatched',
      'arrived',
      'delivered',
    ])
    expect(view.points.map((point) => point.order)).toEqual([1, 2, 3])
  })

  it('dezenas de eventos no mesmo lugar e na mesma categoria viram um pino com contagem', () => {
    const items = Array.from({ length: 40 }, (_, index) =>
      located(
        `i${index}`,
        `2026-09-18T12:${String(index).padStart(2, '0')}:00.000Z`,
        'stop.arrived',
        -23.55,
        -46.63,
      ),
    )
    const view = resolveTimelineMapView(items, translate)
    expect(view.points).toHaveLength(1)
    expect(view.points[0]?.count).toBe(40)
    expect(view.locatedCount).toBe(40)
  })

  it('categorias distintas no mesmo lugar compartilham a coordenada exata para abrir em leque', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-09-18T12:00:00.000Z', 'stop.arrived', -23.55, -46.63),
        located('b', '2026-09-18T12:05:00.000Z', 'document.delivered', -23.55001, -46.63001),
        located('c', '2026-09-18T12:09:00.000Z', 'stop.departed', -23.55002, -46.63002),
      ],
      translate,
    )
    expect(view.points).toHaveLength(3)
    const keys = new Set(view.points.map((point) => `${point.latitude}:${point.longitude}`))
    expect(keys.size).toBe(1)
  })

  it('lugares distintos não se fundem', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-09-18T12:00:00.000Z', 'stop.arrived', -23.55, -46.63),
        located('b', '2026-09-18T12:05:00.000Z', 'stop.arrived', -23.56, -46.64),
      ],
      translate,
    )
    expect(view.points).toHaveLength(2)
  })

  it('resume as categorias presentes, com a contagem de eventos', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-09-18T12:00:00.000Z', 'stop.occurrence', -23.5, -46.6),
        located('b', '2026-09-18T12:01:00.000Z', 'document.occurrence', -23.6, -46.7),
      ],
      translate,
    )
    expect(view.categories).toEqual([{ category: 'occurrence', count: 2 }])
  })
})
