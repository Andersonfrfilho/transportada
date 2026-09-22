/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 D10/T301: `nfeTotalValue` some do detalhe da viagem — na nota solta em `documents` e na
 * mesma nota aninhada sob `stops` — sem `trip.financials`. Ausente, não `null`.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseData,
  tripDetailPath,
  TRIP_DETAIL,
  TRIP_DOCUMENT_DETAIL,
} from '../fixtures/trip-http-payload.fixture'
import {
  createTripHttpFixture,
  FINANCIALS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/trip-http.fixture'

const STOP_WITH_DOCUMENT = {
  addressKey: 'stop-address-key',
  arrivedAt: null,
  cityCode: '3550308',
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: [TRIP_DOCUMENT_DETAIL],
  id: '00000000-0000-4000-8000-000000000b01',
  label: 'Parada única',
  latitude: '-23.550520',
  longitude: '-46.633308',
  sequence: 1,
  state: 'SP',
}

describe('GET /trips/:id cuts nfeTotalValue without trip.financials (spec 153 D10/T301)', () => {
  test('answers documents and nested stop documents without nfeTotalValue', async () => {
    const fixture = await createTripHttpFixture({
      getTripResult: { ...TRIP_DETAIL, stops: [STOP_WITH_DOCUMENT] },
      permissions: READ_ONLY_PERMISSIONS,
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))
    const data = (await responseData(response)) as unknown as Record<string, unknown>

    expect(response.status).toBe(200)
    const [document] = data.documents as readonly Record<string, unknown>[]
    expect(Object.hasOwn(document ?? {}, 'nfeTotalValue')).toBe(false)
    const [stop] = data.stops as readonly Record<string, unknown>[]
    const [stopDocument] = stop?.documents as readonly Record<string, unknown>[]
    expect(Object.hasOwn(stopDocument ?? {}, 'nfeTotalValue')).toBe(false)
    // Nem tudo é dinheiro: o status fiscal e o número da nota continuam.
    expect(document?.fiscalStatus).toBe(TRIP_DOCUMENT_DETAIL.fiscalStatus)
    expect(document?.nfeNumber).toBe(TRIP_DOCUMENT_DETAIL.nfeNumber)
  })

  test('answers with nfeTotalValue when the caller has trip.financials', async () => {
    const fixture = await createTripHttpFixture({
      getTripResult: { ...TRIP_DETAIL, stops: [STOP_WITH_DOCUMENT] },
      permissions: FINANCIALS_PERMISSIONS,
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))
    const data = (await responseData(response)) as unknown as Record<string, unknown>

    expect(response.status).toBe(200)
    const [document] = data.documents as readonly Record<string, unknown>[]
    expect(document?.nfeTotalValue).toBe(TRIP_DOCUMENT_DETAIL.nfeTotalValue)
    const [stop] = data.stops as readonly Record<string, unknown>[]
    const [stopDocument] = stop?.documents as readonly Record<string, unknown>[]
    expect(stopDocument?.nfeTotalValue).toBe(TRIP_DOCUMENT_DETAIL.nfeTotalValue)
  })
})
