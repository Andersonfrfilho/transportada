/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: `documents[].deliveryDeadline` no detalhe da viagem — o prazo da nota, ou `null`
 * (`not_applicable`). Não é dinheiro nem dado pessoal: aparece sem `trip.financials`. Os cinco formatos
 * são o JSON de referência que o painel aceita (cópia idêntica, conferida abaixo), e o campo vai **só** no
 * detalhe: o painel lê o `TripDocument` com chaves exatas.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  LINK_NFE_DOCUMENT_BODY,
  responseData,
  tripDetailPath,
  TRIP_DETAIL,
  TRIP_DOCUMENT_DETAIL,
  TRIP_ID,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import { createTripHttpFixture, READ_ONLY_PERMISSIONS } from '../fixtures/trip-http.fixture'
import type { DeliveryDeadlineView } from '../../src/trips/domain/delivery-deadline.types.js'

const GOLDEN_NAME = 'trip-document-delivery-deadline.golden.json'
const GOLDEN_URL = new URL(`../fixtures/${GOLDEN_NAME}`, import.meta.url)

type DocumentBody = Record<string, unknown>

async function readDocuments(deliveryDeadline: DeliveryDeadlineView | null) {
  const documents = [{ ...TRIP_DOCUMENT_DETAIL, deliveryDeadline }]
  const fixture = await createTripHttpFixture({
    getTripResult: { ...TRIP_DETAIL, documents },
    permissions: READ_ONLY_PERMISSIONS,
  })
  const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))
  const body = (await responseData(response)) as { documents: DocumentBody[] }
  return body.documents
}

describe('spec 236 T1.2c — o prazo de entrega no detalhe da viagem', () => {
  test('answers null when the note has no deadline', async () => {
    const [document] = await readDocuments(null)

    expect(document?.deliveryDeadline).toBeNull()
  })

  test('answers every state exactly as the golden the panel accepts', async () => {
    const golden = (await Bun.file(GOLDEN_URL).json()) as Record<string, DeliveryDeadlineView>

    for (const [state, expected] of Object.entries(golden)) {
      const [document] = await readDocuments(expected)

      expect(document?.deliveryDeadline).toEqual(expected)
      expect((document?.deliveryDeadline as { state: string }).state).toBe(state)
    }
  })

  test('never answers it on the plain TripDocument the panel reads with exact keys', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: LINK_NFE_DOCUMENT_BODY,
        method: 'POST',
        path: `${TRIPS_PATH}/${TRIP_ID}/documents`,
      }),
    )

    expect(response.status).toBe(201)
    expect(Object.keys((await responseData(response)) as DocumentBody)).not.toContain(
      'deliveryDeadline',
    )
  })

  test('the golden has no state missing', async () => {
    const golden = (await Bun.file(GOLDEN_URL).json()) as Record<string, unknown>

    expect(Object.keys(golden).sort()).toEqual(
      ['delivered_late', 'delivered_on_time', 'due_today', 'on_time', 'overdue'].sort(),
    )
  })

  test('the golden is the same one the panel carries', async () => {
    const own = await Bun.file(GOLDEN_URL).text()
    const copy = await Bun.file(
      new URL(`../../../frontend-transportada/test/fixtures/${GOLDEN_NAME}`, import.meta.url),
    ).text()

    expect(copy).toBe(own)
  })
})
