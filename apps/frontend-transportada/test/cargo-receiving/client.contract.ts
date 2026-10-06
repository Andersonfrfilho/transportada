/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4: o cliente HTTP da chegada — caminho, verbo, corpo e cabeçalho de cada rota, e o erro
 * que carrega o código e os `details` do servidor (`web.md` §11). `fetch` injetado, nenhuma rede.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoReceivingClient } from '@/modules/cargo-receiving/shared/cargoReceivingClient.service'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import {
  ALFA_ID,
  ARRIVAL_ID,
  buildAvailable,
  buildDetail,
  buildSummary,
} from '../fixtures/cargoReceiving.fixture'

type Captured = { body: string; headers: Headers; method: string; url: URL }

function harness(respond: (captured: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = []
  const client = createCargoReceivingClient({
    apiUrl: 'https://api.test',
    fetch: async (input) => {
      const request = input as Request
      const captured = {
        body: await request.clone().text(),
        headers: request.headers,
        method: request.method,
        url: new URL(request.url),
      }
      calls.push(captured)
      return respond(captured)
    },
    getAccessToken: () => Promise.resolve('token-sintetico'),
  })
  return { calls, client }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

describe('o cliente da chegada (spec 237 T2.4)', () => {
  test('lista as chegadas com limite 100, o cursor e os filtros do servidor', async () => {
    const { calls, client } = harness(() => json({ data: [buildSummary()], nextCursor: null }))

    await client.listArrivals({ cursor: 'c-1', filters: { contractorId: ALFA_ID, status: 'open' } })

    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url.pathname).toBe('/cargo-arrivals')
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      contractorId: ALFA_ID,
      cursor: 'c-1',
      limit: '100',
      status: 'open',
    })
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-sintetico')
  })

  test('sem filtro nem cursor só vai o limite', async () => {
    const { calls, client } = harness(() => json({ data: [], nextCursor: null }))

    await client.listArrivals({ cursor: null, filters: {} })

    expect([...(calls[0]?.url.searchParams.keys() ?? [])]).toEqual(['limit'])
  })

  test('lê a chegada pelo id', async () => {
    const { calls, client } = harness(() => json({ data: buildDetail() }))

    const detail = await client.getArrival(ARRIVAL_ID)

    expect(calls[0]?.url.pathname).toBe(`/cargo-arrivals/${ARRIVAL_ID}`)
    expect(detail.groups.length).toBeGreaterThan(0)
  })

  test('lista as notas livres do contratante', async () => {
    const { calls, client } = harness(() => json({ data: [buildAvailable(1)], nextCursor: 'next' }))

    const page = await client.listAvailableDocuments({ contractorId: ALFA_ID, cursor: null })

    expect(calls[0]?.url.pathname).toBe('/cargo-arrivals/available-documents')
    expect(calls[0]?.url.searchParams.get('contractorId')).toBe(ALFA_ID)
    expect(calls[0]?.url.searchParams.get('limit')).toBe('100')
    expect(page.nextCursor).toBe('next')
  })

  test('registra com a chave de idempotência no cabeçalho e sem empresa no corpo', async () => {
    const { calls, client } = harness(() => json({ data: buildDetail() }, 201))

    const result = await client.registerArrival({
      idempotencyKey: 'chave-de-teste-0001',
      input: {
        arrivedAt: '2026-10-03T12:00:00.000Z',
        contractorId: ALFA_ID,
        documentIds: ['a', 'b'],
        palletCount: 3,
      },
    })

    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url.pathname).toBe('/cargo-arrivals')
    expect(calls[0]?.headers.get('idempotency-key')).toBe('chave-de-teste-0001')
    expect(calls[0]?.headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      arrivedAt: '2026-10-03T12:00:00.000Z',
      contractorId: ALFA_ID,
      documentIds: ['a', 'b'],
      palletCount: 3,
    })
    expect(result.isReplay).toBe(false)
  })

  test('a repetição com a mesma chave volta 200 e a tela a trata como repetição', async () => {
    const { client } = harness(() => json({ data: buildDetail() }, 200))

    const result = await client.registerArrival({
      idempotencyKey: 'chave-de-teste-0001',
      input: { arrivedAt: '2026-10-03T12:00:00.000Z', contractorId: ALFA_ID, documentIds: ['a'] },
    })

    expect(result.isReplay).toBe(true)
  })

  test('o lote de estado vai para batch-status com as notas e o destino', async () => {
    const { calls, client } = harness(() =>
      json({ data: { results: [{ documentId: 'a', outcome: 'changed' }] } }),
    )

    const outcomes = await client.batchStatus({
      arrivalId: ARRIVAL_ID,
      documentIds: ['a'],
      to: 'received',
    })

    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url.pathname).toBe(`/cargo-arrivals/${ARRIVAL_ID}/documents/batch-status`)
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ documentIds: ['a'], to: 'received' })
    expect(outcomes).toEqual([{ documentId: 'a', outcome: 'changed' }])
  })

  test('a rota vai em route-assignment, com null para limpar', async () => {
    const { calls, client } = harness(() => json({ data: { results: [] } }))

    await client.assignRoute({ arrivalId: ARRIVAL_ID, documentIds: ['a'], routeName: null })

    expect(calls[0]?.url.pathname).toBe(`/cargo-arrivals/${ARRIVAL_ID}/route-assignment`)
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ documentIds: ['a'], routeName: null })
  })

  test('fecha a chegada com POST e corpo vazio', async () => {
    const { calls, client } = harness(() =>
      json({ data: { arrivalId: ARRIVAL_ID, outcome: 'changed' } }),
    )

    const result = await client.closeArrival(ARRIVAL_ID)

    expect(calls[0]?.url.pathname).toBe(`/cargo-arrivals/${ARRIVAL_ID}/close`)
    expect(calls[0]?.method).toBe('POST')
    expect(result.outcome).toBe('changed')
  })

  test('o erro do servidor leva o código e os details, sem jogar nada fora', async () => {
    const { client } = harness(() =>
      json(
        {
          error: {
            code: 'CARGO_ARRIVAL_DOCUMENTS_REFUSED',
            details: [
              { field: 'documentIds.0', message: 'DOCUMENT_IN_LIVE_TRIP' },
              { field: 'documentIds.2', message: 'DOCUMENT_FROM_ANOTHER_ISSUER' },
              { broken: true },
            ],
            message: 'Some documents cannot enter this cargo arrival',
          },
        },
        422,
      ),
    )

    const error = await client
      .registerArrival({
        idempotencyKey: 'chave-de-teste-0001',
        input: { arrivedAt: '2026-10-03T12:00:00.000Z', contractorId: ALFA_ID, documentIds: ['a'] },
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CargoReceivingRequestError)
    expect((error as CargoReceivingRequestError).message).toBe('CARGO_ARRIVAL_DOCUMENTS_REFUSED')
    expect((error as CargoReceivingRequestError).details).toEqual([
      { field: 'documentIds.0', message: 'DOCUMENT_IN_LIVE_TRIP' },
      { field: 'documentIds.2', message: 'DOCUMENT_FROM_ANOTHER_ISSUER' },
    ])
  })

  test('o 409 do fechamento leva o documentId de cada pendente até a tela (L7)', async () => {
    const { client } = harness(() =>
      json(
        {
          error: {
            code: 'CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS',
            details: [
              { documentId: 'doc-a', field: 'pendingDocumentIds.0', message: 'Not separated' },
              { documentId: 7, field: 'pendingDocumentIds.1', message: 'Not separated' },
            ],
            message: 'Every document must be separated before closing the cargo arrival',
          },
        },
        409,
      ),
    )

    const error = await client.closeArrival(ARRIVAL_ID).catch((caught: unknown) => caught)

    expect((error as CargoReceivingRequestError).details).toEqual([
      { documentId: 'doc-a', field: 'pendingDocumentIds.0', message: 'Not separated' },
      { field: 'pendingDocumentIds.1', message: 'Not separated' },
    ])
  })

  test('queda de rede vira REQUEST_FAILED — é o código que a tela traduz por "sem conexão"', async () => {
    const client = createCargoReceivingClient({
      apiUrl: 'https://api.test',
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      getAccessToken: () => Promise.resolve('t'),
    })

    const error = await client.getArrival(ARRIVAL_ID).catch((caught: unknown) => caught)

    expect((error as CargoReceivingRequestError).message).toBe('REQUEST_FAILED')
  })

  test('resposta que não é JSON vira RESPONSE_INVALID', async () => {
    const { client } = harness(() => new Response('<html>', { status: 200 }))

    const error = await client.getArrival(ARRIVAL_ID).catch((caught: unknown) => caught)

    expect((error as CargoReceivingRequestError).message).toBe('RESPONSE_INVALID')
  })

  test('os contratantes e o perfil são lidos pela projeção mínima: só o que a tela usa', async () => {
    const { calls, client } = harness((captured) =>
      captured.url.pathname === '/contractors'
        ? json({
            data: [
              {
                closingPeriod: 'monthly',
                displayName: 'Alfa Indústria Fictícia',
                id: ALFA_ID,
                notes: '',
                reportEmail: '',
                status: 'active',
                taxId: '11222333000181',
              },
            ],
            page: { nextCursor: null },
          })
        : json({ data: { contractorId: ALFA_ID, isEnabled: true, separationWindowHours: 24 } }),
    )

    const contractors = await client.listContractors({ cursor: null })
    const isEnabled = await client.readReceivingEnabled(ALFA_ID)

    expect(contractors.items).toEqual([
      { displayName: 'Alfa Indústria Fictícia', id: ALFA_ID, taxId: '11222333000181' },
    ])
    expect(calls[0]?.url.searchParams.get('limit')).toBe('100')
    expect(calls[1]?.url.pathname).toBe(`/contractors/${ALFA_ID}/receiving-profile`)
    expect(isEnabled).toBe(true)
  })

  test('contratante sem perfil não tem recebimento ligado', async () => {
    const { client } = harness(() => json({ data: null }))

    expect(await client.readReceivingEnabled(ALFA_ID)).toBe(false)
  })
})
