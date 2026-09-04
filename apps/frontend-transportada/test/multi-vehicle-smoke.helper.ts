/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

import { DRIVER_DETAIL, VEHICLE_DETAIL } from './fleet/fleet.fixture'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, Accept',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

export const SUGGESTION_ID = '00000000-0000-4000-8000-000000000901'
export const FIRST_VEHICLE_ID = '00000000-0000-4000-8000-000000000910'
export const SECOND_VEHICLE_ID = '00000000-0000-4000-8000-000000000911'
export const CREATED_TRIP_ID = '00000000-0000-4000-8000-000000000920'
export const AGGREGATE_DRIVER_ID = '00000000-0000-4000-8000-000000000930'
export const STAFF_DRIVER_ID = '00000000-0000-4000-8000-000000000931'

const ASSUMPTIONS = {
  dutyEnabled: false,
  endPolicy: 'depot',
  fallbackWeightKilograms: '0.00',
  originAddressKey: 'depot',
  serviceTimeSeconds: 600,
  serviceTimeSource: 'default',
  solverTimeBudgetSeconds: 30,
} as const

function buildStop(input: Readonly<{ label: string; sequence: number; vehicleId: string | null }>) {
  return {
    addressKey: `3543402|1402000${input.sequence}|100`,
    distanceFromPreviousMeters: 2_400,
    durationFromPreviousSeconds: 420,
    estimatedArrivalAt: '2026-08-28T13:00:00.000Z',
    excludedFromOptimization: input.vehicleId === null,
    geocodingPrecision: input.vehicleId === null ? 'city' : 'rooftop',
    label: input.label,
    latitude: '-21.1767000',
    longitude: '-47.8208000',
    sequence: input.sequence,
    serviceTimeSampleSize: null,
    serviceTimeSeconds: 600,
    serviceTimeSource: 'default',
    stopId: null,
    vehicleId: input.vehicleId,
    violations: [],
    weightEstimated: true,
  }
}

const QUEUED = {
  assumptions: ASSUMPTIONS,
  createdAt: '2026-08-27T12:00:00.000Z',
  decidedAt: null,
  errorCode: '',
  estimatedCostAmount: null,
  estimatedDistanceMeters: null,
  estimatedDurationSeconds: null,
  id: SUGGESTION_ID,
  seed: 7,
  status: 'queued',
  stops: [],
  tripId: null,
  truncated: false,
  updatedAt: '2026-08-27T12:00:00.000Z',
  vehicleId: null,
} as const

/**
 * A proposta que o worker devolveria: duas paradas com veículo — duas viagens — e uma **sem**, que é
 * a de precisão grosseira esperando decisão humana (ADR-0044 §5). É essa terceira que o teste usa
 * para provar que ela aparece e que não conta como viagem.
 */
const READY = {
  ...QUEUED,
  estimatedCostAmount: '184.5000',
  estimatedDistanceMeters: 24_000,
  estimatedDurationSeconds: 5_400,
  status: 'ready',
  stops: [
    buildStop({ label: 'Loja Centro', sequence: 1, vehicleId: FIRST_VEHICLE_ID }),
    buildStop({ label: 'Loja Norte', sequence: 2, vehicleId: SECOND_VEHICLE_ID }),
    buildStop({ label: 'Sítio sem número', sequence: 3, vehicleId: null }),
  ],
} as const

const ACCEPTED = {
  suggestion: { ...READY, decidedAt: '2026-08-27T12:05:00.000Z', status: 'accepted' },
  trips: [
    {
      documentCount: 2,
      /** RF-6: a tela diz quem ficou com a viagem sem abrir a viagem para descobrir. */
      driverId: AGGREGATE_DRIVER_ID,
      stopCount: 1,
      tripId: CREATED_TRIP_ID,
      vehicleId: FIRST_VEHICLE_ID,
    },
  ],
} as const

export type MultiVehicleMockState = Readonly<{
  acceptRequests: () => number
  createdBodies: () => readonly Record<string, unknown>[]
  readRequests: () => number
}>

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  const origin = (await route.request().headerValue('origin')) ?? 'http://localhost:53000'
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': origin },
    status,
  })
}

async function fulfillOptions(route: Route): Promise<void> {
  const origin = (await route.request().headerValue('origin')) ?? 'http://localhost:53000'
  await route.fulfill({
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': origin },
    status: 204,
  })
}

/**
 * Spec 058 P2: os mocks da distribuição multi-veículo. A **primeira** leitura devolve `queued` e a
 * segunda `ready` — é assim que o poll da tela é exercitado de verdade, em vez de a proposta já
 * chegar pronta e o teste nunca passar pelo estado que o operador mais vê.
 */
export async function mockMultiVehicleApi(page: Page): Promise<MultiVehicleMockState> {
  const state = {
    acceptRequests: 0,
    createdBodies: [] as Record<string, unknown>[],
    readRequests: 0,
  }

  await page.route(/\/fleet\/vehicles(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: [
        { ...VEHICLE_DETAIL, id: FIRST_VEHICLE_ID, plate: 'ABC1D23' },
        { ...VEHICLE_DETAIL, id: SECOND_VEHICLE_ID, plate: 'XYZ9A88' },
        /** Implemento: ele existe na frota e **não** pode ser oferecido — a API o recusaria. */
        { ...VEHICLE_DETAIL, id: crypto.randomUUID(), plate: 'REB0C11', role: 'trailer' },
      ],
      page: { nextCursor: null },
    })
  })

  /**
   * Spec 081: o cadastro do par. O agregado tem **um** veículo e por isso preenche sozinho; o da
   * casa tem dois, e é o caso ambíguo que a tela se recusa a decidir.
   */
  await page.route(/\/fleet\/drivers(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: [
        { ...DRIVER_DETAIL, id: AGGREGATE_DRIVER_ID, name: 'Agregado Sintetico' },
        { ...DRIVER_DETAIL, id: STAFF_DRIVER_ID, name: 'Motorista da Casa' },
      ],
      page: { nextCursor: null },
    })
  })

  await page.route(/\/fleet\/driver-vehicles$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: [
        { driverId: AGGREGATE_DRIVER_ID, vehicleId: FIRST_VEHICLE_ID },
        { driverId: STAFF_DRIVER_ID, vehicleId: FIRST_VEHICLE_ID },
        { driverId: STAFF_DRIVER_ID, vehicleId: SECOND_VEHICLE_ID },
      ],
    })
  })

  await page.route(/\/route-suggestions\/multi-vehicle$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    state.createdBodies.push(route.request().postDataJSON() as Record<string, unknown>)
    await fulfillJson(route, { data: QUEUED }, 202)
  })

  await page.route(/\/route-suggestions\/[^/]+\/accept$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    state.acceptRequests += 1
    await fulfillJson(route, { data: ACCEPTED })
  })

  /**
   * ⚠️ O identificador, não `[^/]+`: `multi-vehicle` **também** é um segmento sem barra, e um padrão
   * frouxo aqui rouba o `POST` da criação — o fluxo até parece funcionar, porque a resposta é da
   * mesma forma, e o teste só descobre quando cobra o corpo enviado.
   */
  await page.route(/\/route-suggestions\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    state.readRequests += 1
    await fulfillJson(route, { data: state.readRequests === 1 ? QUEUED : READY })
  })

  return {
    acceptRequests: () => state.acceptRequests,
    createdBodies: () => state.createdBodies,
    readRequests: () => state.readRequests,
  }
}
