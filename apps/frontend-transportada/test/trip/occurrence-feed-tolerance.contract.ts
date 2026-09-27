/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Achados B5/B6 da revisão, mesma família da quebra de 22/09 (`trip.constant.ts`): o guard do
 * feed de ocorrências (`GET /trip-occurrences`) aceitava `case` nulo e objeto, mas **recusava a
 * chave ausente** — um item reprovado derrubava a workspace inteira, sem degradação, no cenário
 * comum de bundle novo contra API anterior ao marcador (rollout parcial, rollback). O mesmo valia
 * para `settlementTotal`, que o guard exigia `null` **literal**: no dia em que a API o preencher
 * (T8 é hoje `null`, valor chega em spec futura), o item inteiro reprovaria.
 */
import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import { EMPTY_TRIP_OCCURRENCE_FILTERS } from '@/modules/trip/shared/tripOccurrenceFeed.service'

const API_URL = 'https://api.example.test'
const ACCESS_TOKEN = 'synthetic-token'
const LIST_INPUT = {
  cursor: null,
  filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
  order: 'desc',
  perPage: 20,
} as const

function buildFeedItem(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    case: null,
    createdAt: '2026-09-22T19:03:10.795Z',
    description: 'Avaria no transporte',
    driverName: 'Motorista',
    hasAttachment: false,
    id: '4b581a02-3dba-4df9-a20b-20ac66163fa1',
    invoiceNumber: null,
    invoiceSeries: null,
    notifies: true,
    source: 'document',
    stage: 'separation',
    stopLabel: null,
    tripId: 'trip-1',
    typeName: 'Item avariado',
    vehiclePlate: 'ABC1D23',
    ...extra,
  }
}

const CASE_VIEW = {
  decision: null,
  redeliveryPolicy: 'allowed',
  settlementTotal: null,
  status: 'recorded',
  updatedAt: '2026-09-22T19:10:00.000Z',
} as const

function createClient(response: Response) {
  return createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: () => Promise.resolve(response),
    getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
  })
}

describe('tolerância a case/settlementTotal ausentes no feed (achados B5/B6)', () => {
  test('aceita o item de hoje, com case nulo e settlementTotal nulo', async () => {
    const client = createClient(
      Response.json({
        data: [buildFeedItem({ case: { ...CASE_VIEW, status: 'decided' } })],
        pagination: { nextCursor: null },
      }),
    )

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.case?.status).toBe('decided')
  })

  /** B5: chave `case` ausente (não `null`) não pode derrubar a página inteira de ocorrências. */
  test('degrada case ausente para null, em vez de reprovar o item', async () => {
    const raw = buildFeedItem()
    delete (raw as Record<string, unknown>).case

    const client = createClient(Response.json({ data: [raw], pagination: { nextCursor: null } }))

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.case).toBeNull()
  })

  /** B6: `settlementTotal` ausente dentro de `case` também degrada para `null`. */
  test('degrada settlementTotal ausente dentro de case para null', async () => {
    const rawCase: Record<string, unknown> = { ...CASE_VIEW }
    delete rawCase.settlementTotal

    const client = createClient(
      Response.json({
        data: [buildFeedItem({ case: rawCase })],
        pagination: { nextCursor: null },
      }),
    )

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items[0]?.case?.settlementTotal).toBeNull()
  })

  /** B6: no dia em que a API preencher o valor, o item continua aceito — não só `null`. */
  test('aceita settlementTotal preenchido, quando a API mandar o valor', async () => {
    const client = createClient(
      Response.json({
        data: [buildFeedItem({ case: { ...CASE_VIEW, settlementTotal: '1250.00' } })],
        pagination: { nextCursor: null },
      }),
    )

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items[0]?.case?.settlementTotal).toBe('1250.00')
  })

  /** Tolerar a ausência não é aceitar qualquer coisa: presente com forma errada continua reprovando. */
  test('recusa case presente com forma inesperada', async () => {
    const client = createClient(
      Response.json({
        data: [buildFeedItem({ case: { status: 'decided' } })],
        pagination: { nextCursor: null },
      }),
    )

    const caught = await client.listOccurrences(LIST_INPUT).catch((error: unknown) => error)

    expect(caught).toEqual(expect.objectContaining({ message: 'TRIP_RESPONSE_INVALID' }))
  })
})

/** Spec 183 T205: o bloco da nota na linha segue a mesma regra — ausente degrada, errado reprova. */
describe('o bloco da nota no feed (spec 183 RF2)', () => {
  const DOCUMENT = {
    contractor: { contractorId: null, name: 'Emitente Sem Cadastro', taxId: '11222333000181' },
    destination: null,
    nfeDocumentId: 'nfe-1',
    totalValue: '1250.5000',
  } as const

  test('traz contratante e valor da nota como string decimal', async () => {
    const client = createClient(
      Response.json({
        data: [buildFeedItem({ document: DOCUMENT })],
        pagination: { nextCursor: null },
      }),
    )

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items[0]?.document).toEqual(DOCUMENT)
  })

  test('document ausente (API anterior à 183) degrada para null', async () => {
    const client = createClient(
      Response.json({ data: [buildFeedItem()], pagination: { nextCursor: null } }),
    )

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items[0]?.document).toBeNull()
  })

  test('valor da nota como number reprova — dinheiro nunca vira number', async () => {
    const client = createClient(
      Response.json({
        data: [buildFeedItem({ document: { ...DOCUMENT, totalValue: 1250.5 } })],
        pagination: { nextCursor: null },
      }),
    )

    const caught = await client.listOccurrences(LIST_INPUT).catch((error: unknown) => error)

    expect(caught).toEqual(expect.objectContaining({ message: 'TRIP_RESPONSE_INVALID' }))
  })
})

/**
 * Spec 183 T404 (RF4): `conversation` chegou depois do feed. Ausente (API anterior) ou malformado
 * degrada para "sem conversa", nunca derruba a página.
 */
describe('tolerância ao estado da conversa no feed (spec 183 T404)', () => {
  test('lê o estado da conversa e as não lidas do motorista', async () => {
    const client = createClient(
      Response.json({
        data: [
          buildFeedItem({ conversation: { contractorState: 'replied', driverUnreadCount: 2 } }),
        ],
        pagination: { nextCursor: null },
      }),
    )

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items[0]?.conversation).toEqual({
      contractorState: 'replied',
      driverUnreadCount: 2,
    })
  })

  test('ausente ou malformado vira "sem conversa", sem reprovar o item', async () => {
    const client = createClient(
      Response.json({
        data: [
          buildFeedItem(),
          buildFeedItem({
            conversation: { contractorState: 'decided', driverUnreadCount: -1 },
            id: 'other',
          }),
        ],
        pagination: { nextCursor: null },
      }),
    )

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items.map((item) => item.conversation)).toEqual([
      { contractorState: 'none', driverUnreadCount: 0 },
      { contractorState: 'none', driverUnreadCount: 0 },
    ])
  })
})
