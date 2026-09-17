/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CORRELATION_ID,
  jsonRequest,
  responseApiError,
  responseData,
  tripDetailPath,
  TRIP_DETAIL,
  TRIP_ID,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createTripHttpFixture,
  FINANCIALS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/trip-http.fixture'

describe('GET /trips/:id', () => {
  test('answers the trip with its documents (fiscal status included) and drivers', async () => {
    const fixture = await createTripHttpFixture({ permissions: FINANCIALS_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(TRIP_DETAIL)
    expect(fixture.getTripCalls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: FINANCIALS_PERMISSIONS },
        tripId: TRIP_ID,
      },
    ])
  })

  test('refuses an identifier that is not a trip id', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${TRIPS_PATH}/not-a-uuid` }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('NOT_FOUND')
    expect(fixture.getTripCalls).toEqual([])
  })

  test('answers 404 when the trip is not in this company', async () => {
    const fixture = await createTripHttpFixture({
      getTripError: new ApiError({
        code: 'TRIP_NOT_FOUND',
        message: 'Trip not found.',
        status: 404,
      }),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_NOT_FOUND')
  })

  /**
   * Spec 145 D7/D16 (T10): o `GET` lê o que o worker guardou e, quando a planta do hash atual falta,
   * falhou ou parou além do lease, pede de novo — **depois** da leitura, pelo caso de uso próprio (a
   * transação curta dele), com o correlation id da requisição.
   */
  test('asks for the layout after the read, with the request correlation id', async () => {
    const pendingCargoLayoutInput = {
      bedDimensions: { heightM: '2.500', lengthM: '8.000', source: 'measured', widthM: '2.400' },
      capacityM3: '48.000',
      stops: [],
    }
    const fixture = await createTripHttpFixture({
      getTripResult: {
        ...TRIP_DETAIL,
        cargoLayoutState: { ...TRIP_DETAIL.cargoLayoutState, status: 'pending' },
        pendingCargoLayoutInput,
      },
      permissions: READ_ONLY_PERMISSIONS,
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(200)
    expect(fixture.requestCargoLayoutCalls).toEqual([
      {
        ...pendingCargoLayoutInput,
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        tripId: TRIP_ID,
      },
    ])
  })

  /**
   * D7: enfileirar é "pedi para calcular", não parte da resposta. Upsert que lança não derruba a
   * leitura que já deu certo — vira aviso com correlation id, viagem e código, nunca rótulo nem cliente.
   */
  test('a failing lazy request still answers the read, and warns without PII', async () => {
    const cargoLayoutState = { ...TRIP_DETAIL.cargoLayoutState, status: 'failed' }
    const fixture = await createTripHttpFixture({
      getTripResult: {
        ...TRIP_DETAIL,
        cargoLayoutState,
        pendingCargoLayoutInput: {
          capacityM3: '48.000',
          stops: [{ clientName: 'Cliente Sigiloso', label: 'Rua Sigilosa, 10', sequence: 1 }],
        },
      },
      permissions: FINANCIALS_PERMISSIONS,
      requestCargoLayoutError: new ApiError({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database unavailable.',
        status: 503,
      }),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({ ...TRIP_DETAIL, cargoLayoutState })
    expect(fixture.requestCargoLayoutCalls).toHaveLength(1)
    expect(fixture.warnings).toEqual([
      {
        message: 'trip.cargo_layout.request_failed',
        metadata: {
          correlationId: CORRELATION_ID,
          errorCode: 'DATABASE_UNAVAILABLE',
          tripId: TRIP_ID,
        },
      },
    ])
    expect(JSON.stringify(fixture.warnings)).not.toContain('Sigilos')
  })

  test('serves the layout state and never the pending input', async () => {
    const cargoLayoutState = {
      computedAt: '2026-09-12T10:00:00.000Z',
      errorCode: 'CARGO_LAYOUT_FAILED',
      stale: true,
      status: 'failed',
      truncated: true,
    }
    const fixture = await createTripHttpFixture({
      getTripResult: {
        ...TRIP_DETAIL,
        cargoLayoutState,
        pendingCargoLayoutInput: { capacityM3: '48.000', stops: [] },
      },
      requestCargoLayoutResult: {
        enqueued: false,
        layoutId: '00000000-0000-4000-8000-000000000c01',
        status: 'failed',
      },
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))
    const data = (await responseData(response)) as Record<string, unknown>

    expect(data.cargoLayoutState).toEqual(cargoLayoutState)
    expect(Object.keys(data)).not.toContain('pendingCargoLayoutInput')
  })

  /**
   * Orquestrador na T11 (D16/D18): o lazy que **enfileirou** muda o que a resposta diz — o pedido novo
   * está pendente, e o código da falha antiga não vale mais. A planta `stale` continua servida.
   */
  test('a lazy request that enqueued answers pending, without the old error code', async () => {
    const fixture = await createTripHttpFixture({
      getTripResult: {
        ...TRIP_DETAIL,
        cargoLayoutState: {
          computedAt: '2026-09-12T10:00:00.000Z',
          errorCode: 'CARGO_LAYOUT_FAILED',
          stale: true,
          status: 'failed',
          truncated: false,
        },
        pendingCargoLayoutInput: { capacityM3: '48.000', stops: [] },
      },
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))
    const data = (await responseData(response)) as Record<string, unknown>

    expect(fixture.requestCargoLayoutCalls).toHaveLength(1)
    expect(data.cargoLayoutState).toEqual({
      computedAt: '2026-09-12T10:00:00.000Z',
      errorCode: null,
      stale: true,
      status: 'pending',
      truncated: false,
    })
  })

  test('does not ask when the read needs nothing, unavailable included', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(200)
    expect(TRIP_DETAIL.cargoLayoutState.status).toBe('unavailable')
    expect(fixture.requestCargoLayoutCalls).toEqual([])
  })

  test('denies who has neither fleet.read nor fleet.manage', async () => {
    const fixture = await createTripHttpFixture({ permissions: new Set([]) })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(403)
    expect(fixture.getTripCalls).toEqual([])
  })
})
