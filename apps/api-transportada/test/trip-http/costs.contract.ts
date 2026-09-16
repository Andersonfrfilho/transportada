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

const PATH = `${TRIPS_PATH}/${TRIP_ID}/costs`

describe('os lançamentos de custo da viagem, pela rota (spec 143 aceites 6 e 7)', () => {
  test('responde os lançamentos com o autor para quem tem trip.financials', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['fleet.read', 'trip.financials']),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject([
      { actor: { name: 'Ana Souza' }, kind: 'toll' },
    ])
    expect(fixture.listTripCostsCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, tripId: TRIP_ID },
    ])
  })

  /**
   * Spec 143: a mesma rota tem permissão diferente por método — `POST` é `trip.manage` (quem monta
   * a viagem lança pedágio e avulso), `GET` é `trip.financials` (dinheiro é permissão própria, D4 da
   * spec 061). Quem só administra a viagem não vê o lançamento que a própria operação criou.
   */
  test('recusa quem só tem trip.manage — a leitura é permissão diferente da escrita', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['fleet.read', 'trip.manage']),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(403)
    expect(fixture.listTripCostsCalls).toEqual([])
  })
})
