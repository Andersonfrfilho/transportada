/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseData,
  TRIP_ID,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

const PATH = `${TRIPS_PATH}/${TRIP_ID}/valuation`

describe('a avaliação prevista da viagem, pela rota', () => {
  test('responde a conta da viagem para quem tem trip.financials', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['fleet.read', 'trip.manage', 'trip.financials']),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ totalMargin: '200.0000' })
    expect(fixture.readValuationCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, tripId: TRIP_ID },
    ])
  })

  /**
   * Spec 061 D4: dinheiro tem permissão própria. Quem monta a viagem sem ela não vê a margem — e o
   * caso que importa é o motorista, que tem `trip.read` e o custo dele está aqui dentro.
   */
  test('recusa quem só gerencia a viagem', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['fleet.read', 'trip.manage']),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(403)
    expect(fixture.readValuationCalls).toEqual([])
  })
})
