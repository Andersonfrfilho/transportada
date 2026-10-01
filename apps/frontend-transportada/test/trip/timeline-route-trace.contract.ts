/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { RouteGeometry } from '../../src/modules/trip/shared/routeGeometry.service'
import { resolveRouteLegs } from '../../src/modules/trip/shared/routeGeometry.service'
import {
  TIMELINE_MAP_CAPTION_KEY_BY_TRACE,
  TIMELINE_ROUTE_MAX_POINTS,
  TIMELINE_ROUTE_MIN_POINTS,
} from '../../src/modules/trip/shared/tripTimelineMap.constant'
import type { TimelineMapPoint } from '../../src/modules/trip/shared/tripTimelineMap.service'
import {
  createTimelineRouteGeometryQueryOptions,
  resolveTimelineRouteTrace,
} from '../../src/modules/trip/shared/tripTimelineRoute.service'

function point(order: number, latitude: number, longitude: number): TimelineMapPoint {
  return {
    category: 'arrived',
    count: 1,
    icon: 'map-pin',
    intervalLabel: null,
    key: `timeline-map-${order}`,
    label: 'Chegada',
    lastOccurredAt: `2026-09-18T12:0${order}:00.000Z`,
    latitude,
    longitude,
    minutesFromPrevious: null,
    occurredAt: `2026-09-18T12:0${order}:00.000Z`,
    order,
  }
}

const TWO_POINTS = [point(1, -23.55, -46.63), point(2, -23.5, -46.6)] as const

function geometry(input: {
  readonly points: readonly Readonly<{ latitude: string; longitude: string }>[]
  readonly source: 'road' | 'unavailable'
}): RouteGeometry {
  return { legs: [], points: input.points, source: input.source, toll: null }
}

const ROAD = geometry({
  points: [
    { latitude: '-23.55', longitude: '-46.63' },
    { latitude: '-23.52', longitude: '-46.61' },
    { latitude: '-23.5', longitude: '-46.6' },
  ],
  source: 'road',
})

const UNAVAILABLE = geometry({ points: [], source: 'unavailable' })

/** O mesmo corte que o mapa faz, para a legenda ser conferida contra o traço, não contra si mesma. */
function drawnKinds(value: null | RouteGeometry): readonly string[] {
  return resolveRouteLegs({
    geometry: value,
    project: (coordinate) => ({ x: coordinate.longitude, y: coordinate.latitude }),
    stops: TWO_POINTS.map((entry) => ({ x: entry.longitude, y: entry.latitude })),
  }).map((leg) => leg.kind)
}

describe('rota do minimapa da linha do tempo (spec 196)', () => {
  it('sem geometria o traço é reto, e a legenda diz que é reta', () => {
    const trace = resolveTimelineRouteTrace({ geometry: null, points: TWO_POINTS })
    expect(trace).toBe('straight')
    expect(TIMELINE_MAP_CAPTION_KEY_BY_TRACE[trace]).toBe('eventTimeline.map.captionStraight')
  })

  it('geometria `unavailable` cai para a reta, sem erro e sem mapa vazio', () => {
    expect(resolveTimelineRouteTrace({ geometry: UNAVAILABLE, points: TWO_POINTS })).toBe(
      'straight',
    )
  })

  it('geometria de estrada vira traço de estrada, e a legenda para de dizer que é reta', () => {
    const trace = resolveTimelineRouteTrace({ geometry: ROAD, points: TWO_POINTS })
    expect(trace).toBe('road')
    expect(TIMELINE_MAP_CAPTION_KEY_BY_TRACE[trace]).toBe('eventTimeline.map.captionRoad')
  })

  it('estrada com um único ponto não é estrada desenhável: a legenda volta a dizer reta', () => {
    const single = geometry({
      points: [{ latitude: '-23.55', longitude: '-46.63' }],
      source: 'road',
    })
    expect(resolveTimelineRouteTrace({ geometry: single, points: TWO_POINTS })).toBe('straight')
  })

  it('um lugar só não desenha traço nenhum, e a legenda não promete linha', () => {
    const trace = resolveTimelineRouteTrace({ geometry: ROAD, points: [TWO_POINTS[0]] })
    expect(trace).toBe('none')
    expect(TIMELINE_MAP_CAPTION_KEY_BY_TRACE[trace]).toBe('eventTimeline.map.captionPoint')
  })

  /** ⚠️ A legenda é consequência do traço: conferir uma contra a outra é o que impede a linha de mentir. */
  it('a legenda concorda com o que o mapa realmente desenhou, caso a caso', () => {
    for (const value of [null, UNAVAILABLE, ROAD]) {
      const trace = resolveTimelineRouteTrace({ geometry: value, points: TWO_POINTS })
      const kinds = drawnKinds(value)
      expect(kinds.length).toBeGreaterThan(0)
      expect(new Set(kinds)).toEqual(new Set([trace]))
    }
  })

  it('pede a estrada entre os pontos dos eventos, em ordem, e sem veículo', async () => {
    const calls: unknown[] = []
    const options = createTimelineRouteGeometryQueryOptions({
      client: {
        readPointsRouteGeometry: (input) => {
          calls.push(input)
          return Promise.resolve(ROAD)
        },
      },
      points: TWO_POINTS,
    })

    expect(options.enabled).toBe(true)
    await options.queryFn()
    expect(calls).toEqual([
      {
        points: [
          { latitude: -23.55, longitude: -46.63 },
          { latitude: -23.5, longitude: -46.6 },
        ],
        vehicleId: null,
      },
    ])
  })

  it('não pergunta nada abaixo de dois pontos nem acima do teto que a API aceita', () => {
    const client = { readPointsRouteGeometry: () => Promise.resolve(ROAD) }
    const many = Array.from({ length: TIMELINE_ROUTE_MAX_POINTS + 1 }, (_, index) =>
      point(index + 1, -23.55 + index / 1000, -46.63 + index / 1000),
    )

    expect(createTimelineRouteGeometryQueryOptions({ client, points: [] }).enabled).toBe(false)
    expect(
      createTimelineRouteGeometryQueryOptions({ client, points: [TWO_POINTS[0]] }).enabled,
    ).toBe(false)
    expect(createTimelineRouteGeometryQueryOptions({ client, points: many }).enabled).toBe(false)
    expect(
      createTimelineRouteGeometryQueryOptions({
        client,
        points: many.slice(0, TIMELINE_ROUTE_MAX_POINTS),
      }).enabled,
    ).toBe(true)
    expect(TIMELINE_ROUTE_MIN_POINTS).toBe(2)
  })

  it('a chave da consulta muda quando os pontos mudam de lugar', () => {
    const client = { readPointsRouteGeometry: () => Promise.resolve(ROAD) }
    const first = createTimelineRouteGeometryQueryOptions({ client, points: TWO_POINTS })
    const moved = createTimelineRouteGeometryQueryOptions({
      client,
      points: [TWO_POINTS[0], point(2, -22.9, -43.2)],
    })

    expect(first.queryKey).not.toEqual(moved.queryKey)
    expect(first.queryKey).toEqual(
      createTimelineRouteGeometryQueryOptions({ client, points: TWO_POINTS }).queryKey,
    )
  })
})
