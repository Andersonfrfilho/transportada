/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  NFE_DOCUMENT_ID,
  responseApiError,
  tripDocumentPath,
  tripDocumentsPath,
} from '../fixtures/trip-http-payload.fixture'
import { createTripHttpFixture } from '../fixtures/trip-http.fixture'

/**
 * ADR-0043 §2, T013: vincular e desvincular nota selam a partir de `dispatched`, na mesma porta de
 * não-retorno de separar/carregar (T006). Este arquivo testa a fronteira HTTP com o erro que o caso
 * de uso já lança (T013, `trip.use-case.ts`) — a máquina de estado pura e a corrida travada por
 * `SELECT ... FOR UPDATE` (`drizzle-trip.repository.ts`) já têm cobertura própria.
 */
describe('linking and releasing documents seal once the trip is dispatched (spec 056 T013)', () => {
  test('refuses to link a document once the trip is dispatched, with the shared transition error', async () => {
    const { TripStateTransitionNotAllowedError } = await import(
      '../../src/trips/domain/trip.error.js'
    )
    const fixture = await createTripHttpFixture({
      linkTripDocumentError: new TripStateTransitionNotAllowedError('TRIP_ALREADY_DISPATCHED'),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { freightCalculationId: null, nfeDocumentId: NFE_DOCUMENT_ID },
        method: 'POST',
        path: tripDocumentsPath(),
      }),
    )

    expect(response.status).toBe(409)
    const error = await responseApiError(response)
    expect(error.code).toBe('STATE_TRANSITION_NOT_ALLOWED')
  })

  test('refuses to release a document once the trip is dispatched', async () => {
    const { TripStateTransitionNotAllowedError } = await import(
      '../../src/trips/domain/trip.error.js'
    )
    const fixture = await createTripHttpFixture({
      releaseTripDocumentError: new TripStateTransitionNotAllowedError('TRIP_ALREADY_DISPATCHED'),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: tripDocumentPath() }),
    )

    expect(response.status).toBe(409)
    const error = await responseApiError(response)
    expect(error.code).toBe('STATE_TRANSITION_NOT_ALLOWED')
  })

  test('refuses to release a document once the trip is completed or cancelled', async () => {
    const { TripStateTransitionNotAllowedError } = await import(
      '../../src/trips/domain/trip.error.js'
    )

    for (const reason of ['TRIP_COMPLETED', 'TRIP_CANCELLED'] as const) {
      const fixture = await createTripHttpFixture({
        releaseTripDocumentError: new TripStateTransitionNotAllowedError(reason),
      })

      const response = await fixture.handle(
        jsonRequest({ method: 'DELETE', path: tripDocumentPath() }),
      )

      expect(response.status).toBe(409)
      const error = await responseApiError(response)
      expect(error.code).toBe('STATE_TRANSITION_NOT_ALLOWED')
    }
  })
})
