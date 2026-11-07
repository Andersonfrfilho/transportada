/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T2.2 (RF4, D1): distância e tempo da lista de paradas — com ponto, sem ponto, OSRM fora, uma parada sem
 * estrada — e o gateway do OSRM `table` (uma chamada, resposta validada, falha é `null`).
 */
import { describe, expect, it } from 'bun:test'

import type { RouteDistanceTablePort } from '../../src/trips/application/route-distance-table.port.js'
import { createOsrmRouteDistanceTableGateway } from '../../src/trips/infrastructure/osrm-route-distance-table.gateway.js'
import {
  describeListDistance,
  describeListDuration,
} from '../../src/whatsapp-commands/domain/whatsapp-stop-card.policy.js'
import { createWhatsAppStopListTravelReader } from '../../src/whatsapp-commands/infrastructure/whatsapp-stop-list-travel.reader.js'

const COMPANY_ID = 'company-1'
const ORIGIN_POINT = { latitude: -20.5, longitude: -47.4 }
const TRIP = {
  stops: [
    { arrivedAt: '2026-11-07T12:00:00.000Z', enRouteSince: null, id: 'stop-2' },
    { arrivedAt: null, enRouteSince: null, id: 'stop-3' },
    { arrivedAt: null, enRouteSince: null, id: 'stop-4' },
  ],
} as never
const STOPS = [
  { coordinate: { latitude: -20.31, longitude: -48.31 }, id: 'stop-3' },
  { coordinate: { latitude: -20.58, longitude: -47.85 }, id: 'stop-4' },
  { id: 'stop-5' },
]

function tableReturning(cells: Awaited<ReturnType<RouteDistanceTablePort['readDistancesFrom']>>) {
  const calls: unknown[] = []
  const table: RouteDistanceTablePort = {
    readDistancesFrom: (origin, destinations) => {
      calls.push({ destinations, origin })
      return Promise.resolve(cells)
    },
  }
  return { calls, table }
}

describe('a distância e o tempo da lista de paradas (spec 300 T2.2)', () => {
  it('com ponto: uma chamada com a origem e só as paradas com coordenada, linha formatada como o desenho', async () => {
    const { calls, table } = tableReturning([
      { distanceMetres: 108_400, durationSeconds: 5_100 },
      { distanceMetres: 3_240, durationSeconds: 480 },
    ])
    const reader = createWhatsAppStopListTravelReader({
      readOriginPoint: () => Promise.resolve(ORIGIN_POINT),
      table,
    })

    const travel = await reader.read({ companyId: COMPANY_ID, stops: STOPS, trip: TRIP })

    expect(calls).toEqual([
      {
        destinations: [STOPS[0]?.coordinate, STOPS[1]?.coordinate],
        origin: ORIGIN_POINT,
      },
    ])
    expect(travel.isLocationMissing).toBe(false)
    expect([...travel.byStopId]).toEqual([
      ['stop-3', { distance: '108 km', duration: '~1 h 25 min' }],
      ['stop-4', { distance: '3,2 km', duration: '~8 min' }],
    ])
  })

  it('sem ponto compartilhado: nenhuma chamada, nenhuma linha e o rodapé da localização', async () => {
    const { calls, table } = tableReturning([])
    const reader = createWhatsAppStopListTravelReader({
      readOriginPoint: () => Promise.resolve(null),
      table,
    })

    const travel = await reader.read({ companyId: COMPANY_ID, stops: STOPS, trip: TRIP })

    expect(calls).toEqual([])
    expect(travel.isLocationMissing).toBe(true)
    expect([...travel.byStopId]).toEqual([])
  })

  it('OSRM fora do ar: nenhuma linha, sem o rodapé, e a lista sai', async () => {
    const warnings: unknown[] = []
    const reader = createWhatsAppStopListTravelReader({
      logger: { warn: (message, fields) => warnings.push([message, fields]) },
      readOriginPoint: () => Promise.resolve(ORIGIN_POINT),
      table: tableReturning(null).table,
    })

    const travel = await reader.read({ companyId: COMPANY_ID, stops: STOPS, trip: TRIP })

    expect(travel.isLocationMissing).toBe(false)
    expect([...travel.byStopId]).toEqual([])
    expect(warnings).toEqual([
      [
        'whatsapp_stop_list_travel.unavailable',
        { companyId: COMPANY_ID, reason: 'routing_unavailable' },
      ],
    ])
  })

  it('uma parada sem estrada: só ela fica sem linha', async () => {
    const reader = createWhatsAppStopListTravelReader({
      readOriginPoint: () => Promise.resolve(ORIGIN_POINT),
      table: tableReturning([null, { distanceMetres: 56_000, durationSeconds: 2_700 }]).table,
    })

    const travel = await reader.read({ companyId: COMPANY_ID, stops: STOPS, trip: TRIP })

    expect([...travel.byStopId]).toEqual([['stop-4', { distance: '56 km', duration: '~45 min' }]])
  })

  it('sem o serviço configurado: nenhuma linha, sem exceção', async () => {
    const reader = createWhatsAppStopListTravelReader({
      readOriginPoint: () => Promise.resolve(ORIGIN_POINT),
    })

    const travel = await reader.read({ companyId: COMPANY_ID, stops: STOPS, trip: TRIP })

    expect(travel).toEqual({ byStopId: new Map(), isLocationMissing: false })
  })

  it('formata como o desenho: inteiro a partir de 10 km, minutos e horas', () => {
    expect(
      [108_400, 56_000, 3_240, 6_100, 4_800, 9_960].map((metres) => describeListDistance(metres)),
    ).toEqual(['108 km', '56 km', '3,2 km', '6,1 km', '4,8 km', '10 km'])
    expect(
      [5_100, 2_700, 480, 840, 20, 3_600].map((seconds) => describeListDuration(seconds)),
    ).toEqual(['~1 h 25 min', '~45 min', '~8 min', '~14 min', '~1 min', '~1 h 00 min'])
  })
})

function gatewayAnswering(body: unknown, status = 200) {
  const urls: string[] = []
  const gateway = createOsrmRouteDistanceTableGateway({
    baseUrl: 'http://osrm.test/',
    fetchImplementation: ((url: string) => {
      urls.push(url)
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    }) as unknown as typeof fetch,
  })
  return { gateway, urls }
}

const ORIGIN = { latitude: -20.5, longitude: -47.4 }
const DESTINATIONS = [
  { latitude: -20.3, longitude: -48.3 },
  { latitude: -20.6, longitude: -47.8 },
]

describe('o gateway do OSRM table (spec 300 D1)', () => {
  it('pede uma chamada com origem e destinos e devolve um item por destino, null na célula sem estrada', async () => {
    const { gateway, urls } = gatewayAnswering({
      code: 'Ok',
      distances: [[0, 108_400, null]],
      durations: [[0, 5_100, null]],
    })

    const cells = await gateway.readDistancesFrom(ORIGIN, DESTINATIONS)

    expect(urls).toEqual([
      'http://osrm.test/table/v1/driving/-47.4,-20.5;-48.3,-20.3;-47.8,-20.6?sources=0&annotations=duration,distance',
    ])
    expect(cells).toEqual([{ distanceMetres: 108_400, durationSeconds: 5_100 }, null])
  })

  it('resposta que não casa, código de erro, HTTP de erro e rede caída viram null', async () => {
    const malformed = [
      gatewayAnswering({ code: 'Ok', distances: 'x', durations: [[0, 1, 2]] }),
      gatewayAnswering({ code: 'Ok', distances: [[0, 1]], durations: [[0, 1]] }),
      gatewayAnswering({ code: 'NoTable', distances: [[0, 1, 2]], durations: [[0, 1, 2]] }),
      gatewayAnswering({ code: 'Ok', distances: [[0, 1, 2]], durations: [[0, 1, 2]] }, 502),
    ]
    const results = await Promise.all(
      malformed.map((entry) => entry.gateway.readDistancesFrom(ORIGIN, DESTINATIONS)),
    )
    const offline = await createOsrmRouteDistanceTableGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    }).readDistancesFrom(ORIGIN, DESTINATIONS)

    expect(results).toEqual([null, null, null, null])
    expect(offline).toBeNull()
  })
})
