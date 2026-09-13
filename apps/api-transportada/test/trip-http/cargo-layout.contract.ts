/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { TripCargoLayoutNotFoundError } from '../../src/trips/domain/trip.error.js'
import {
  CORRELATION_ID,
  jsonRequest,
  NFE_DOCUMENT_ID,
  responseApiError,
  TRIPS_PATH,
  VEHICLE_ID,
} from '../fixtures/trip-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  READ_ONLY_PERMISSIONS,
  createTripHttpFixture,
} from '../fixtures/trip-http.fixture'

const LAYOUT_ID = '00000000-0000-4000-8000-000000000c01'
const CARGO_LAYOUTS_PATH = `${TRIPS_PATH}/cargo-layouts`
const PENDING_STATE = {
  computedAt: null,
  errorCode: null,
  stale: false,
  status: 'pending',
  truncated: false,
}

/** Spec 145 T11: a prévia pede a planta com o correlation id da requisição, como o detalhe (T10). */
describe('POST /trips/cargo-preview', () => {
  test('passes the request correlation id to the preview', async () => {
    const fixture = await createTripHttpFixture({
      previewCargoResult: { cargoLayout: null, layoutId: LAYOUT_ID, state: PENDING_STATE },
    })

    const response = await fixture.handle(
      jsonRequest({
        body: {
          driverIds: [],
          nfeDocumentIds: [NFE_DOCUMENT_ID],
          stopOrder: [],
          vehicleId: VEHICLE_ID,
        },
        method: 'POST',
        path: `${TRIPS_PATH}/cargo-preview`,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { cargoLayout: null, layoutId: LAYOUT_ID, state: PENDING_STATE },
    })
    expect(fixture.previewCargoCalls).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        driverIds: [],
        nfeDocumentIds: [NFE_DOCUMENT_ID],
        stopOrder: [],
        vehicleId: VEHICLE_ID,
      },
    ])
  })
})

/**
 * Spec 145 D10 (T11): a tela pergunta de novo enquanto a planta está pendente. A busca é por
 * `(companyId do contexto, id)` — o id nunca basta sozinho.
 */
describe('GET /trips/cargo-layouts/:layoutId', () => {
  test('answers layoutId, state and cargoLayout, looked up in the company of the context', async () => {
    const fixture = await createTripHttpFixture({
      readCargoLayoutResult: { cargoLayout: null, layoutId: LAYOUT_ID, state: PENDING_STATE },
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${CARGO_LAYOUTS_PATH}/${LAYOUT_ID}` }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(Object.keys(body.data).sort()).toEqual(['cargoLayout', 'layoutId', 'state'])
    expect(Object.keys(body.data.state as object).sort()).toEqual([
      'computedAt',
      'errorCode',
      'stale',
      'status',
      'truncated',
    ])
    expect(body.data).toEqual({ cargoLayout: null, layoutId: LAYOUT_ID, state: PENDING_STATE })
    expect(fixture.readCargoLayoutCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, layoutId: LAYOUT_ID },
    ])
  })

  test('answers 404 when the layout is not in this company', async () => {
    const fixture = await createTripHttpFixture({
      readCargoLayoutError: new TripCargoLayoutNotFoundError(),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${CARGO_LAYOUTS_PATH}/${LAYOUT_ID}` }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_CARGO_LAYOUT_NOT_FOUND')
  })

  test('refuses an identifier that is not a uuid with 400, before any lookup', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${CARGO_LAYOUTS_PATH}/not-a-uuid` }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.readCargoLayoutCalls).toEqual([])
  })

  describe('reopening what stopped (D16/D18)', () => {
    const FAILED_STATE = {
      computedAt: null,
      errorCode: 'CARGO_LAYOUT_FAILED',
      stale: false,
      status: 'failed',
      truncated: false,
    }
    const PAST_THE_WAIT = {
      cargoLayout: null,
      layoutId: LAYOUT_ID,
      shouldRequest: true,
      state: FAILED_STATE,
    }

    async function poll(params: Parameters<typeof createTripHttpFixture>[0]) {
      const fixture = await createTripHttpFixture(params)
      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: `${CARGO_LAYOUTS_PATH}/${LAYOUT_ID}` }),
      )
      return { body: (await response.json()) as { data: unknown }, fixture, response }
    }

    test('a row past the wait is reopened with the request correlation id, and answers pending', async () => {
      const { body, fixture, response } = await poll({ readCargoLayoutResult: PAST_THE_WAIT })

      expect(response.status).toBe(200)
      expect(fixture.reopenCargoLayoutCalls).toEqual([
        {
          companyId: COMPANY_CONTEXT.companyId,
          correlationId: CORRELATION_ID,
          layoutId: LAYOUT_ID,
        },
      ])
      expect(body).toEqual({
        data: { cargoLayout: null, layoutId: LAYOUT_ID, state: PENDING_STATE },
      })
    })

    test('a recent row is only read, never reopened', async () => {
      const { fixture } = await poll({
        readCargoLayoutResult: { ...PAST_THE_WAIT, shouldRequest: false },
      })

      expect(fixture.reopenCargoLayoutCalls).toEqual([])
    })

    test('an upsert that did not reopen keeps the state of the read', async () => {
      const { body } = await poll({
        readCargoLayoutResult: PAST_THE_WAIT,
        reopenCargoLayoutResult: { enqueued: false, layoutId: LAYOUT_ID, status: 'failed' },
      })

      expect(body).toEqual({
        data: { cargoLayout: null, layoutId: LAYOUT_ID, state: FAILED_STATE },
      })
    })

    test('a failing reopen still answers the read, and warns without PII', async () => {
      const { body, fixture, response } = await poll({
        readCargoLayoutResult: PAST_THE_WAIT,
        reopenCargoLayoutError: new ApiError({
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database unavailable.',
          status: 503,
        }),
      })

      expect(response.status).toBe(200)
      expect(body).toEqual({
        data: { cargoLayout: null, layoutId: LAYOUT_ID, state: FAILED_STATE },
      })
      expect(fixture.warnings).toEqual([
        {
          message: 'trip.cargo_layout.request_failed',
          metadata: {
            correlationId: CORRELATION_ID,
            errorCode: 'DATABASE_UNAVAILABLE',
            layoutId: LAYOUT_ID,
          },
        },
      ])
    })
  })

  /** A mesma permissão da prévia que o criou: quem só lê viagem não montou a prévia. */
  test('is trip.manage, like the preview that created the layout', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${CARGO_LAYOUTS_PATH}/${LAYOUT_ID}` }),
    )

    expect(response.status).toBe(403)
    expect(fixture.readCargoLayoutCalls).toEqual([])
  })
})
