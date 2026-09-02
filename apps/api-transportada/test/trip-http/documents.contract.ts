/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TripDocumentAlreadyDeliveredError,
  TripDocumentAlreadyLinkedError,
  TripDocumentReferenceInvalidError,
} from '../../src/trips/domain/trip.error.js'
import {
  FREIGHT_CALCULATION_ID,
  jsonRequest,
  LINK_FREIGHT_CALCULATION_BODY,
  LINK_NFE_DOCUMENT_BODY,
  NFE_DOCUMENT_ID,
  responseApiError,
  responseData,
  TRIP_DOCUMENT_ID,
  TRIP_ID,
  tripDocumentDeliverPath,
  tripDocumentPath,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

const TRIP_DOCUMENTS_PATH = `${TRIPS_PATH}/${TRIP_ID}/documents`

describe('trip documents http contract', () => {
  test('links a document by nfe document id', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: LINK_NFE_DOCUMENT_BODY, method: 'POST', path: TRIP_DOCUMENTS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toMatchObject({ nfeDocumentId: NFE_DOCUMENT_ID })
    expect(fixture.linkTripDocumentCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        freightCalculationId: null,
        nfeDocumentId: NFE_DOCUMENT_ID,
        tripId: TRIP_ID,
      },
    ])
  })

  test('links a document by freight calculation id', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: LINK_FREIGHT_CALCULATION_BODY,
        method: 'POST',
        path: TRIP_DOCUMENTS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.linkTripDocumentCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        freightCalculationId: FREIGHT_CALCULATION_ID,
        nfeDocumentId: null,
        tripId: TRIP_ID,
      },
    ])
  })

  // XOR é regra de domínio (trip.policy.ts) — a fronteira HTTP só repassa o par nulo/preenchido
  test('propagates the domain refusal when the reference is not exactly one', async () => {
    const fixture = await createTripHttpFixture({
      linkTripDocumentError: new TripDocumentReferenceInvalidError(),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { freightCalculationId: null, nfeDocumentId: null },
        method: 'POST',
        path: TRIP_DOCUMENTS_PATH,
      }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_DOCUMENT_REFERENCE_INVALID')
  })

  test('propagates a conflict when the document is already linked elsewhere', async () => {
    const fixture = await createTripHttpFixture({
      linkTripDocumentError: new TripDocumentAlreadyLinkedError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: LINK_NFE_DOCUMENT_BODY, method: 'POST', path: TRIP_DOCUMENTS_PATH }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('TRIP_DOCUMENT_ALREADY_LINKED')
  })

  /**
   * ⚠️ O corpo mudou de `{deliveredAt}` para `{document, tripStatus}`, e a mudança é o conserto.
   * Entregar tinha rota própria, fora da máquina de estados: ela gravava a hora e **não** mexia em
   * `separationStatus`, então a nota ficava `pending` com hora de entrega, a barra de progresso não
   * saía do lugar e a viagem — cujo estado é derivado do das notas — nunca chegava a `completed`.
   * Hoje ela passa pelo mesmo caminho de separar, carregar e devolver, e por isso devolve o estado
   * da viagem junto: é ele que a tela precisa para se atualizar sem recarregar.
   */
  test('delivers a linked document through the state machine', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentDeliverPath() }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({
      document: expect.any(Object),
      tripStatus: expect.any(String),
    })
    expect(fixture.deliverTripDocumentCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        documentId: TRIP_DOCUMENT_ID,
        note: null,
        returnReason: null,
        tripId: TRIP_ID,
      },
    ])
  })

  test('releases a linked document', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: tripDocumentPath() }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ releasedAt: expect.any(String) })
    expect(fixture.releaseTripDocumentCalls).toEqual([
      { context: COMPANY_CONTEXT, documentId: TRIP_DOCUMENT_ID, tripId: TRIP_ID },
    ])
  })

  // Uma vez entregue, o vínculo trava (spec 027 § Dúvidas) — release propaga a recusa do domínio
  test('refuses releasing a document already delivered', async () => {
    const fixture = await createTripHttpFixture({
      releaseTripDocumentError: new TripDocumentAlreadyDeliveredError(),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: tripDocumentPath() }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_DOCUMENT_ALREADY_DELIVERED')
  })

  test('never matches a non-uuid path for the trip or the document', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: `${TRIPS_PATH}/${TRIP_ID}/documents/not-a-uuid` }),
    )

    expect(response.status).toBe(404)
    expect(fixture.releaseTripDocumentCalls).toEqual([])
  })
})
