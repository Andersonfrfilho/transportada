/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T3.4 (RF4, R6, R9): a separação e o lote do escritório pedem a lista de tipos ao servidor, por
 * nota — o cliente não filtra tipo por escopo nem por etapa. A recusa 422 do lote nomeia as notas recusadas,
 * lidas dos `documentIds` do erro e traduzidas para o número da nota no cliente.
 */
import { describe, expect, test } from 'bun:test'

import { readRefusedScopeDocuments } from '@/modules/trip/shared/occurrenceScopeRefusal.service'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'

const TRIP_ID = '0b5f7c1e-2f43-4f6a-9d7e-3c1a2b4d5e6f'
const DOCUMENT_ID = '7d2e1f4a-9b8c-4c3d-8e2f-1a0b9c8d7e6f'
const TYPE = {
  active: true,
  allowsMultipleItems: true,
  emailTemplateKey: null,
  id: 'type-1',
  name: 'Item faltante',
  notifies: false,
  redeliveryPolicy: 'unset',
  stage: 'separation',
}

function buildClient(requests: string[], data: readonly unknown[] = [TYPE]) {
  return createTripClient({
    apiUrl: 'https://api.example.test',
    fetch: (request: RequestInfo | URL) => {
      const received = new Request(request)
      requests.push(
        `${received.method} ${new URL(received.url).pathname}${new URL(received.url).search}`,
      )
      return Promise.resolve(Response.json({ data }))
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

describe('os tipos por nota (spec 270 T3.4)', () => {
  test('a separação pede os tipos da nota da viagem', async () => {
    const requests: string[] = []

    const types = await buildClient(requests).listSeparationOccurrenceTypes({
      documentId: DOCUMENT_ID,
      tripId: TRIP_ID,
    })

    expect(requests).toEqual([`GET /trips/${TRIP_ID}/documents/${DOCUMENT_ID}/occurrence-types`])
    expect(types.map((type) => type.id)).toEqual(['type-1'])
  })

  test('o lote do escritório manda os documentIds do lote, na ordem', async () => {
    const requests: string[] = []

    await buildClient(requests, []).readFieldOccurrenceTypes({ documentIds: ['d-1', 'd-2'] })

    expect(requests).toEqual(['GET /trips/occurrence-types/field?documentIds=d-1%2Cd-2'])
  })

  test('sem notas, a lista de rua não leva parâmetro', async () => {
    const requests: string[] = []

    await buildClient(requests, []).readFieldOccurrenceTypes()
    await buildClient(requests, []).readFieldOccurrenceTypes({ documentIds: [] })

    expect(requests).toEqual([
      'GET /trips/occurrence-types/field',
      'GET /trips/occurrence-types/field',
    ])
  })
})

describe('as notas recusadas pelo escopo (spec 270 T3.4, R9)', () => {
  const NO_LINKS = { freightCalculationId: null, nfeDocumentId: null }
  const DOCUMENTS = [
    { ...NO_LINKS, id: 'd-1', nfeNumber: '1001', nfeSeries: '1' },
    { ...NO_LINKS, id: 'd-2', nfeNumber: '1002', nfeSeries: '1' },
    { ...NO_LINKS, id: 'd-3', nfeNumber: '1003', nfeSeries: '' },
  ]

  function refusal(ids: readonly string[], code = 'OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR') {
    return Object.assign(new Error(code), {
      details: ids.map((id) => ({ field: 'documentIds', message: id })),
      status: 422,
    })
  }

  test('traduz os ids do erro para o número da nota, na ordem do erro', () => {
    expect(
      readRefusedScopeDocuments({ documents: DOCUMENTS, error: refusal(['d-3', 'd-1']) }),
    ).toEqual(['1003', '1001/1'])
  })

  test('id que a tela não conhece aparece como está, sem esconder a recusa', () => {
    expect(readRefusedScopeDocuments({ documents: DOCUMENTS, error: refusal(['d-9']) })).toEqual([
      'd-9',
    ])
  })

  test('outro erro, ou nenhum, não nomeia nota', () => {
    expect(
      readRefusedScopeDocuments({ documents: DOCUMENTS, error: refusal(['d-1'], 'OTHER') }),
    ).toEqual([])
    expect(readRefusedScopeDocuments({ documents: DOCUMENTS, error: null })).toEqual([])
  })
})
