/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_CORRECTION_ERROR } from '@/modules/trip/shared/occurrence.constant'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'

const API_URL = 'https://api.example.test'
const TRIP_ID = '536b67aa-3409-4ec4-b086-ca5231063edf'
const DOCUMENT_ID = '06a3f3ae-8f0c-401c-a77b-488175b1d0b3'
const OCCURRENCE_ID = 'a4b6ef1d-0049-4814-9d39-47e21b264760'
const OCCURRENCE_PATH = `${API_URL}/trips/${TRIP_ID}/documents/${DOCUMENT_ID}/occurrences/${OCCURRENCE_ID}`

/** Resposta real da escrita (spec 240, evidence.md W1): anexo estreito, sem `email` nem `autoDispatch`. */
const CORRECTED_RESPONSE = {
  data: {
    actorName: 'Operador local',
    attachments: [{ id: '05ec9694-9a8f-4f4c-9e47-93fbddec6aa3', position: 1 }],
    cancellation: null,
    channel: 'driver_app',
    corrections: [
      {
        correctedAt: '2026-10-03T00:39:17.391Z',
        correctedByName: 'Operador local',
        previousItems: [
          { code: '696', quantity: '1.000', unit: 'box' },
          { code: '697', quantity: '1.000', unit: 'unit' },
        ],
      },
    ],
    createdAt: '2026-09-23T02:26:00.359Z',
    id: OCCURRENCE_ID,
    note: 'sdfasdfasdfasdf',
    occurrenceTypeId: '60879fd1-0885-45ed-9dce-e52005a62bf8',
    onBehalfOfDriverName: null,
    productCode: '696',
    productCodes: ['696', '697'],
    products: [
      { code: '696', quantity: '2.000', unit: 'box' },
      { code: '697', quantity: '5.000', unit: 'unit' },
    ],
    stage: 'separation',
    typeName: 'Item avariado',
  },
}

const CANCELLED_RESPONSE = {
  data: {
    ...CORRECTED_RESPONSE.data,
    cancellation: {
      cancelledAt: '2026-10-03T00:39:36.091Z',
      cancelledByName: 'Operador local',
      reason: 'Lancada na nota errada',
    },
  },
}

function createClient(input: { readonly requests: Request[]; readonly response: Response }) {
  return createTripClient({
    apiUrl: API_URL,
    fetch: (resource: RequestInfo | URL, init?: RequestInit) => {
      input.requests.push(new Request(resource, init))
      return Promise.resolve(input.response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

function firstRequest(requests: readonly Request[]): Request {
  const [request] = requests
  if (request === undefined) throw new Error('OCCURRENCE_CORRECTION_REQUEST_MISSING')
  return request
}

describe('cliente HTTP: corrigir os itens da ocorrência', () => {
  test('PATCH .../items manda o conjunto inteiro, com a Idempotency-Key da tentativa', async () => {
    const requests: Request[] = []
    const client = createClient({ requests, response: Response.json(CORRECTED_RESPONSE) })

    await client.correctTripOccurrenceItems({
      documentId: DOCUMENT_ID,
      idempotencyKey: 'attempt-1',
      items: [
        { code: '696', quantity: '2', unit: 'box' },
        { code: '697', quantity: '5', unit: 'unit' },
      ],
      occurrenceId: OCCURRENCE_ID,
      tripId: TRIP_ID,
    })

    const request = firstRequest(requests)
    expect(request.url).toBe(`${OCCURRENCE_PATH}/items`)
    expect(request.method).toBe('PATCH')
    expect(request.cache).toBe('no-store')
    expect(request.headers.get('authorization')).toBe('Bearer synthetic-token')
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(request.headers.get('idempotency-key')).toBe('attempt-1')
    expect(await request.json()).toEqual({
      items: [
        { code: '696', quantity: '2', unit: 'box' },
        { code: '697', quantity: '5', unit: 'unit' },
      ],
    })
  })

  test('item sem contagem sai só com o código — nunca quantity/unit vazios', async () => {
    const requests: Request[] = []
    const client = createClient({ requests, response: Response.json(CORRECTED_RESPONSE) })

    await client.correctTripOccurrenceItems({
      documentId: DOCUMENT_ID,
      idempotencyKey: 'attempt-2',
      items: [{ code: '696' }],
      occurrenceId: OCCURRENCE_ID,
      tripId: TRIP_ID,
    })

    const body: unknown = await firstRequest(requests).json()
    expect(body).toEqual({ items: [{ code: '696' }] })
    expect(JSON.stringify(body)).not.toContain('quantity')
  })

  test('aceita a resposta real da escrita, que não traz email nem autoDispatch', async () => {
    const client = createClient({ requests: [], response: Response.json(CORRECTED_RESPONSE) })

    const result = await client.correctTripOccurrenceItems({
      documentId: DOCUMENT_ID,
      idempotencyKey: 'attempt-3',
      items: [{ code: '696', quantity: '2', unit: 'box' }],
      occurrenceId: OCCURRENCE_ID,
      tripId: TRIP_ID,
    })

    expect(result.id).toBe(OCCURRENCE_ID)
    expect(result.attachments).toEqual([
      { id: '05ec9694-9a8f-4f4c-9e47-93fbddec6aa3', position: 1 },
    ])
    expect(result.products).toEqual(CORRECTED_RESPONSE.data.products)
    expect(result.corrections).toEqual(CORRECTED_RESPONSE.data.corrections)
    expect(result.cancellation).toBeNull()
  })

  test('resposta fora da forma vira TRIP_RESPONSE_INVALID', async () => {
    const client = createClient({
      requests: [],
      response: Response.json({ data: { ...CORRECTED_RESPONSE.data, id: 42 } }),
    })

    const caught = await client
      .correctTripOccurrenceItems({
        documentId: DOCUMENT_ID,
        idempotencyKey: 'attempt-4',
        items: [],
        occurrenceId: OCCURRENCE_ID,
        tripId: TRIP_ID,
      })
      .catch((error: unknown) => error)

    expect(caught).toEqual(expect.objectContaining({ message: 'TRIP_RESPONSE_INVALID' }))
  })
})

describe('cliente HTTP: cancelar a ocorrência', () => {
  test('POST .../cancellation manda { reason } com a Idempotency-Key da tentativa', async () => {
    const requests: Request[] = []
    const client = createClient({ requests, response: Response.json(CANCELLED_RESPONSE) })

    const result = await client.cancelTripOccurrence({
      documentId: DOCUMENT_ID,
      idempotencyKey: 'attempt-5',
      occurrenceId: OCCURRENCE_ID,
      reason: 'Lancada na nota errada',
      tripId: TRIP_ID,
    })

    const request = firstRequest(requests)
    expect(request.url).toBe(`${OCCURRENCE_PATH}/cancellation`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('idempotency-key')).toBe('attempt-5')
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(await request.json()).toEqual({ reason: 'Lancada na nota errada' })
    expect(result.cancellation).toEqual(CANCELLED_RESPONSE.data.cancellation)
  })
})

describe('cliente HTTP: os códigos de recusa chegam intactos, com o status', () => {
  const REFUSALS = [
    [OCCURRENCE_CORRECTION_ERROR.CASE_ALREADY_OPEN, 409],
    [OCCURRENCE_CORRECTION_ERROR.ALREADY_CANCELLED, 409],
    [OCCURRENCE_CORRECTION_ERROR.CANCELLED, 409],
    [OCCURRENCE_CORRECTION_ERROR.ITEM_QUANTITY_NOT_POSITIVE, 400],
    [OCCURRENCE_CORRECTION_ERROR.ITEM_QUANTITY_UNIT_PAIRING, 400],
    [OCCURRENCE_CORRECTION_ERROR.PRODUCT_NOT_IN_DOCUMENT, 422],
    [OCCURRENCE_CORRECTION_ERROR.TYPE_SINGLE_ITEM, 422],
    [OCCURRENCE_CORRECTION_ERROR.CANCELLATION_REASON_REQUIRED, 400],
    [OCCURRENCE_CORRECTION_ERROR.CANCELLATION_REASON_TOO_LONG, 400],
    [OCCURRENCE_CORRECTION_ERROR.OCCURRENCE_NOT_FOUND, 404],
    [OCCURRENCE_CORRECTION_ERROR.IDEMPOTENCY_KEY_REUSED, 409],
  ] as const

  test('os códigos são os que a API devolveu na evidência da Fase 0', () => {
    expect(REFUSALS.map(([code]) => code)).toEqual([
      'OCCURRENCE_CASE_ALREADY_OPEN',
      'OCCURRENCE_ALREADY_CANCELLED',
      'OCCURRENCE_CANCELLED',
      'OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE',
      'OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING',
      'OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT',
      'OCCURRENCE_TYPE_SINGLE_ITEM',
      'OCCURRENCE_CANCELLATION_REASON_REQUIRED',
      'OCCURRENCE_CANCELLATION_REASON_TOO_LONG',
      'TRIP_OCCURRENCE_NOT_FOUND',
      'TRIP_FIELD_REPORT_KEY_REUSED',
    ])
  })

  for (const [code, status] of REFUSALS) {
    test(`${status} ${code} na correção e no cancelamento`, async () => {
      const response = (): Response =>
        Response.json({ error: { code, message: 'refused' } }, { status })
      const correcting = createClient({ requests: [], response: response() })
      const cancelling = createClient({ requests: [], response: response() })

      const correctionError = await correcting
        .correctTripOccurrenceItems({
          documentId: DOCUMENT_ID,
          idempotencyKey: 'attempt-6',
          items: [{ code: '696' }],
          occurrenceId: OCCURRENCE_ID,
          tripId: TRIP_ID,
        })
        .catch((error: unknown) => error)
      const cancellationError = await cancelling
        .cancelTripOccurrence({
          documentId: DOCUMENT_ID,
          idempotencyKey: 'attempt-7',
          occurrenceId: OCCURRENCE_ID,
          reason: 'motivo',
          tripId: TRIP_ID,
        })
        .catch((error: unknown) => error)

      expect(correctionError).toEqual(expect.objectContaining({ message: code, status }))
      expect(cancellationError).toEqual(expect.objectContaining({ message: code, status }))
    })
  }
})
