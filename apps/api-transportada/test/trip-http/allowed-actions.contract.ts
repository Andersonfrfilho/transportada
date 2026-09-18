/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 D10 (ressalva M1): as ações permitidas numa rota própria, com a mesma leitura do
 * detalhe (`fleet.read` ou `trip.report-on-behalf`), calculadas pelas permissões de quem pergunta.
 */
import { describe, expect, test } from 'bun:test'

import { jsonRequest, responseData, tripDetailPath } from '../fixtures/trip-http-payload.fixture'
import { createTripHttpFixture } from '../fixtures/trip-http.fixture'

const STOP_ID = '00000000-0000-4000-8000-000000000b01'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000d01'

const ON_DELIVERY_ROUTE = {
  documents: [{ id: DOCUMENT_ID, releasedAt: null, separationStatus: 'loaded', stopId: STOP_ID }],
  hasDriver: true,
  status: 'on_delivery_route',
  stops: [{ arrivedAt: null, id: STOP_ID }],
}

const OPERATOR_PERMISSIONS = new Set([
  'fleet.read',
  'trip.manage',
  'trip.report-on-behalf',
] as const)

function allowedActionsPath(): string {
  return `${tripDetailPath()}/allowed-actions`
}

type AllowedActions = {
  readonly documents: Readonly<Record<string, readonly string[]>>
  readonly stops: Readonly<Record<string, readonly string[]>>
  readonly trip: readonly string[]
}

describe('GET /trips/:id/allowed-actions (spec 156 D10)', () => {
  test('aceite 4: o operator recebe fieldDelivery e fieldReturn na nota loaded em on_delivery_route', async () => {
    const fixture = await createTripHttpFixture({
      permissions: OPERATOR_PERMISSIONS,
      tripActionSnapshot: ON_DELIVERY_ROUTE,
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: allowedActionsPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData<AllowedActions>(response)
    expect(data.documents[DOCUMENT_ID]).toContain('fieldDelivery')
    expect(data.documents[DOCUMENT_ID]).toContain('fieldReturn')
    expect(data.documents[DOCUMENT_ID]).not.toContain('deliver')
    expect(data.stops[STOP_ID]).toEqual(['arrive', 'occurrence'])
    expect(data.trip).toEqual(['cancel'])
  })

  test('A1: o separador lê a rota e não recebe ação de campo', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['fleet.read', 'trip.manage'] as const),
      tripActionSnapshot: ON_DELIVERY_ROUTE,
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: allowedActionsPath() }),
    )

    expect(response.status).toBe(200)
    expect(await responseData<AllowedActions>(response)).toEqual({
      documents: {},
      stops: {},
      trip: ['cancel'],
    })
  })

  test('o finance lê sem fleet.read e recebe só a baixa', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['trip.financials', 'trip.report-on-behalf'] as const),
      tripActionSnapshot: ON_DELIVERY_ROUTE,
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: allowedActionsPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData<AllowedActions>(response)
    expect(data.documents[DOCUMENT_ID]).toEqual(['fieldDelivery', 'fieldReturn', 'fieldOccurrence'])
    expect(data.trip).toEqual([])
  })

  test('sem fleet.read nem trip.report-on-behalf responde 403', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['trip.financials'] as const),
      tripActionSnapshot: ON_DELIVERY_ROUTE,
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: allowedActionsPath() }),
    )

    expect(response.status).toBe(403)
  })
})
