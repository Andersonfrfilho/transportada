/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d (D9, RF11): a linha de `/pendencias` "a foto da NF X parece ser da NF Y". O painel lê
 * o `kind` novo (detalhes em strings, como a API manda), só oferece "Aplicar" quando `movable` e há
 * destino, e fala com as duas rotas da T5b/T5d: `proof/move` e `proof/mismatch/dismiss`.
 */
import { describe, expect, test } from 'bun:test'

import {
  createPendingItemsClient,
  type CanhotoOtherDocumentPendingItem,
} from '../../src/modules/pending-items/shared/pendingItemsClient.service'

const PROOF_ID = '00000000-0000-4000-8000-000000000951'
const TRIP_ID = '00000000-0000-4000-8000-000000000601'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000661'
const TARGET_ID = '00000000-0000-4000-8000-000000000662'

function apiItem(overrides: Record<string, unknown> = {}) {
  return {
    details: {
      documentId: DOCUMENT_ID,
      kind: 'other_document',
      movable: 'true',
      readNumber: '172195',
      readSeries: '1',
      targetCanhotoApproved: 'false',
      targetDocumentId: TARGET_ID,
      targetNumber: '172195',
      targetSameTrip: 'true',
      targetSeries: '1',
      tripId: TRIP_ID,
      ...overrides,
    },
    entityId: PROOF_ID,
    entityType: 'canhotoProof',
    kind: 'canhotoOtherDocument',
    label: '931988',
  }
}

function clientWith(requests: Request[], body: unknown = { data: [], page: { nextCursor: null } }) {
  return createPendingItemsClient({
    apiUrl: 'https://api.example.test',
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(Response.json(body))
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

async function readItem(overrides: Record<string, unknown> = {}) {
  const client = clientWith([], { data: [apiItem(overrides)], page: { nextCursor: null } })
  const page = await client.listPendingItems({})
  return page.items[0] as CanhotoOtherDocumentPendingItem
}

describe('linha canhotoOtherDocument de /pendencias (spec 344 T5d)', () => {
  test('lê o item com os detalhes em texto da API como número e booleano', async () => {
    expect(await readItem()).toEqual({
      details: {
        documentId: DOCUMENT_ID,
        kind: 'other_document',
        movable: true,
        readNumber: '172195',
        readSeries: '1',
        targetCanhotoApproved: false,
        targetDocumentId: TARGET_ID,
        targetNumber: '172195',
        targetSameTrip: true,
        targetSeries: '1',
        tripId: TRIP_ID,
      },
      entityId: PROOF_ID,
      entityType: 'canhotoProof',
      kind: 'canhotoOtherDocument',
      label: '931988',
    })
  })

  test('sem nota certa no sistema só há "Descartar": nada é movível', async () => {
    const item = await readItem({
      movable: null,
      targetCanhotoApproved: null,
      targetDocumentId: null,
      targetNumber: null,
      targetSameTrip: null,
      targetSeries: null,
    })
    expect(item.details.movable).toBe(false)
    expect(item.details.targetNumber).toBeNull()
  })

  test('movable sem destino nunca vira "Aplicar"', async () => {
    const item = await readItem({ movable: 'true', targetDocumentId: null })
    expect(item.details.movable).toBe(false)
  })

  test('detalhe malformado derruba a página como qualquer item inválido', async () => {
    const client = clientWith([], {
      data: [apiItem({ readNumber: 172195 })],
      page: { nextCursor: null },
    })
    const error = await client.listPendingItems({}).then(
      () => undefined,
      (caught: unknown) => caught,
    )
    expect((error as Error).message).toBe('PENDING_ITEMS_INVALID_RESPONSE')
  })

  test('Aplicar move a foto pela rota da nota da prova, só com destino e motivo', async () => {
    const requests: Request[] = []
    await clientWith(requests).decideCanhotoOtherDocument({
      decision: 'apply',
      item: await readItem(),
    })
    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(
      `https://api.example.test/trips/${TRIP_ID}/documents/${DOCUMENT_ID}/proof/move`,
    )
    expect(await request?.json()).toEqual({ reason: 'wrong_document', targetDocumentId: TARGET_ID })
  })

  test('Descartar não leva corpo e some o alerta daquela prova', async () => {
    const requests: Request[] = []
    await clientWith(requests).decideCanhotoOtherDocument({
      decision: 'dismiss',
      item: await readItem(),
    })
    const [request] = requests
    expect(request?.url).toBe(
      `https://api.example.test/trips/${TRIP_ID}/documents/${DOCUMENT_ID}/proof/mismatch/dismiss`,
    )
    expect(await request?.text()).toBe('')
  })

  test('Aplicar sem destino falha antes de chamar a API', async () => {
    const requests: Request[] = []
    const item = await readItem({ targetDocumentId: null })
    const error = await clientWith(requests)
      .decideCanhotoOtherDocument({ decision: 'apply', item })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      )
    expect((error as Error).message).toBe('PENDING_ITEMS_REQUEST_FAILED')
    expect(requests).toEqual([])
  })
})
