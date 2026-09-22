/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 D10/T301: sem `trip.financials`, pedágio (por praça e total), combustível e custo da
 * rota **saem** do JSON — não viram `null`. D9: distância, duração, volta e a praça em si (sem
 * preço) atravessam intactas, e o índice mais barato continua para o rótulo "mais barata".
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseData,
  tripRouteGeometryPath,
} from '../fixtures/trip-http-payload.fixture'
import {
  createTripHttpFixture,
  FINANCIALS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/trip-http.fixture'

const MONEY_TOLL_BOOTH = {
  chargeCar: '12.50',
  chargePerAxle: '6.25',
  chargePerAxleAutomatic: '5.90',
  effectiveChargePerAxle: '6.25',
  fellBackToManual: false,
  latitude: '-23.550520',
  legIndex: 0,
  longitude: '-46.633308',
  name: 'Praça Teste',
  operator: 'Operadora Teste',
  osmNodeId: 123_456,
  total: '25.00',
}

const MONEY_TOLL = {
  axles: { count: 2, source: 'declared' },
  booths: [MONEY_TOLL_BOOTH],
  boothsFallenBackToManual: 0,
  boothsWithoutCharge: 0,
  catalog: { observedOn: '2026-09-01', status: 'current' },
  chargePerAxle: '6.25',
  multiplier: { denominator: 1, numerator: 2 },
  multiplierLabel: '2 eixos',
  paymentMode: 'automatic',
  tariffObservedOn: '2026-09-01',
  total: '25.00',
}

const MONEY_OPTION = {
  distanceMeters: 42_000,
  durationSeconds: 3_000,
  fuelTotal: '150.00',
  isNoToll: false,
  legs: [{ distanceMetres: 42_000, durationSeconds: 3_000 }],
  points: [],
  signature: 'live-signature-money',
  toll: MONEY_TOLL,
  totalCost: '175.00',
}

const MONEY_ROUTE_VIEW = {
  cheapestIndex: 0,
  choiceReproduced: false,
  costGap: null,
  depot: null,
  fastestIndex: 0,
  hasChoice: false,
  legs: [{ distanceMetres: 42_000, durationSeconds: 3_000 }],
  options: [MONEY_OPTION],
  points: [],
  selectedIndex: 0,
  source: 'road' as const,
  toll: MONEY_TOLL,
}

const FROZEN_MONEY_VIEW = {
  ...MONEY_ROUTE_VIEW,
  criterion: 'fastest' as const,
  distanceMeters: 42_000,
  durationSeconds: 3_000,
  frozen: true,
  returnDistanceMeters: 5_000,
  signature: 'frozen-signature-money',
}

const ROUTE_GEOMETRY_BODY = {
  points: [
    { latitude: -23.55052, longitude: -46.633308 },
    { latitude: -22.906847, longitude: -43.172897 },
  ],
  vehicleId: null,
}

type ToolBooth = Record<string, unknown>
type ToolTop = Record<string, unknown>

function expectTollRedacted(toll: ToolTop): void {
  expect(Object.hasOwn(toll, 'chargePerAxle')).toBe(false)
  expect(Object.hasOwn(toll, 'total')).toBe(false)
  const booths = toll.booths as readonly ToolBooth[]
  for (const booth of booths) {
    expect(Object.hasOwn(booth, 'chargeCar')).toBe(false)
    expect(Object.hasOwn(booth, 'chargePerAxle')).toBe(false)
    expect(Object.hasOwn(booth, 'chargePerAxleAutomatic')).toBe(false)
    expect(Object.hasOwn(booth, 'effectiveChargePerAxle')).toBe(false)
    expect(Object.hasOwn(booth, 'total')).toBe(false)
    expect(booth.name).toBe('Praça Teste')
    expect(booth.operator).toBe('Operadora Teste')
    expect(booth.latitude).toBe('-23.550520')
    expect(booth.longitude).toBe('-46.633308')
  }
}

function expectTollPresent(toll: ToolTop): void {
  expect(toll.chargePerAxle).toBe('6.25')
  expect(toll.total).toBe('25.00')
  const booths = toll.booths as readonly ToolBooth[]
  expect(booths[0]?.chargeCar).toBe('12.50')
  expect(booths[0]?.chargePerAxle).toBe('6.25')
  expect(booths[0]?.chargePerAxleAutomatic).toBe('5.90')
  expect(booths[0]?.effectiveChargePerAxle).toBe('6.25')
  expect(booths[0]?.total).toBe('25.00')
}

describe('POST /route-geometry cuts money without trip.financials (spec 153 D10/T301)', () => {
  test('answers without toll totals, booth charges, fuel and route cost — booths stay on the map', async () => {
    const fixture = await createTripHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
      readRouteGeometryExecute: async () => MONEY_ROUTE_VIEW,
    })

    const response = await fixture.handle(
      jsonRequest({ body: ROUTE_GEOMETRY_BODY, method: 'POST', path: '/route-geometry' }),
    )
    const data = (await responseData(response)) as unknown as Record<string, unknown>

    expect(response.status).toBe(200)
    expectTollRedacted(data.toll as ToolTop)
    const options = data.options as readonly Record<string, unknown>[]
    expect(Object.hasOwn(options[0] ?? {}, 'fuelTotal')).toBe(false)
    expect(Object.hasOwn(options[0] ?? {}, 'totalCost')).toBe(false)
    expectTollRedacted((options[0] as Record<string, unknown>).toll as ToolTop)

    // D9: não é dinheiro — atravessa intacto.
    expect(options[0]?.distanceMeters).toBe(42_000)
    expect(options[0]?.durationSeconds).toBe(3_000)
    expect(data.cheapestIndex).toBe(0)
  })

  test('answers with money when the caller has trip.financials', async () => {
    const fixture = await createTripHttpFixture({
      permissions: FINANCIALS_PERMISSIONS,
      readRouteGeometryExecute: async () => MONEY_ROUTE_VIEW,
    })

    const response = await fixture.handle(
      jsonRequest({ body: ROUTE_GEOMETRY_BODY, method: 'POST', path: '/route-geometry' }),
    )
    const data = (await responseData(response)) as unknown as Record<string, unknown>

    expect(response.status).toBe(200)
    expectTollPresent(data.toll as ToolTop)
    const options = data.options as readonly Record<string, unknown>[]
    expect(options[0]?.fuelTotal).toBe('150.00')
    expect(options[0]?.totalCost).toBe('175.00')
    expectTollPresent((options[0] as Record<string, unknown>).toll as ToolTop)
  })
})

describe('GET /trips/:id/route-geometry cuts money without trip.financials (spec 153 D10/T301)', () => {
  test('answers without money, frozen or not — distance, duration and return survive', async () => {
    const fixture = await createTripHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
      readTripRouteGeometryExecute: async () => FROZEN_MONEY_VIEW,
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripRouteGeometryPath() }),
    )
    const data = (await responseData(response)) as unknown as Record<string, unknown>

    expect(response.status).toBe(200)
    expectTollRedacted(data.toll as ToolTop)
    expect(data.distanceMeters).toBe(42_000)
    expect(data.durationSeconds).toBe(3_000)
    expect(data.returnDistanceMeters).toBe(5_000)
    expect(data.frozen).toBe(true)
  })

  test('answers with money when the caller has trip.financials', async () => {
    const fixture = await createTripHttpFixture({
      permissions: FINANCIALS_PERMISSIONS,
      readTripRouteGeometryExecute: async () => FROZEN_MONEY_VIEW,
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripRouteGeometryPath() }),
    )
    const data = (await responseData(response)) as unknown as Record<string, unknown>

    expect(response.status).toBe(200)
    expectTollPresent(data.toll as ToolTop)
  })
})
