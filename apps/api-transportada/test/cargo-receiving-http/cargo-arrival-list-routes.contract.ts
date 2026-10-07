/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M3): a lista de chegadas filtra por vários contratantes e
 * situações (parâmetro repetido) e ordena no servidor por coluna fechada. Sem os parâmetros novos, a
 * chamada é a de antes: chegada mais recente primeiro, cursor `<iso>::<uuid>`.
 */
import { describe, expect, test } from 'bun:test'

import { encodeCargoArrivalListCursor } from '../../src/cargo-receiving/domain/cargo-arrival-list-order.policy.js'
import { createCargoArrivalRoutes } from '../../src/cargo-receiving/presentation/cargo-arrival.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/freight-region-http.fixture.js'

const FIRST = '00000000-0000-4000-8000-000000000f11'
const SECOND = '00000000-0000-4000-8000-000000000f12'
const ROW_ID = '00000000-0000-4000-8000-000000000f13'

function createListFixture() {
  const calls: unknown[] = []
  const unused = { execute: () => Promise.reject(new Error('not used')) }
  const routes = createCargoArrivalRoutes({
    getArrival: unused as never,
    listArrivals: {
      async execute(params: unknown) {
        calls.push(params)
        return { items: [], nextCursor: null }
      },
    } as never,
    listAvailableDocuments: unused as never,
    registerArrival: unused as never,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(new Set(['fleet.read'])), routes }),
  })
  const list = (query: string) =>
    handleRequest(jsonRequest({ method: 'GET', path: `/cargo-arrivals${query}` }), {
      timeout() {},
    })
  return { calls, list }
}

const DEFAULT_CALL = {
  filters: { contractorIds: [], statuses: [] },
  order: { direction: 'desc', sort: 'arrivedAt' },
  paging: { cursor: null, limit: 25 },
}

describe('filtros repetidos da lista de chegadas (spec 237, M3)', () => {
  test('sem parâmetro, a ordem e a página de antes', async () => {
    const fixture = createListFixture()
    expect((await fixture.list('')).status).toBe(200)
    expect(fixture.calls).toEqual([expect.objectContaining(DEFAULT_CALL)])
  })

  test('um valor continua igual, e vários vão juntos ao servidor', async () => {
    const fixture = createListFixture()
    await fixture.list(`?contractorId=${FIRST}&status=open`)
    await fixture.list(`?contractorId=${FIRST}&contractorId=${SECOND}&status=open&status=closed`)
    expect(fixture.calls).toEqual([
      expect.objectContaining({ filters: { contractorIds: [FIRST], statuses: ['open'] } }),
      expect.objectContaining({
        filters: { contractorIds: [FIRST, SECOND], statuses: ['open', 'closed'] },
      }),
    ])
  })

  test('recusa id inválido, valor repetido, situação desconhecida e lista longa demais', async () => {
    const fixture = createListFixture()
    const manyContractors = Array.from(
      { length: 51 },
      (_, index) => `contractorId=00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    ).join('&')
    const refused = [
      '?contractorId=x',
      `?contractorId=${FIRST}&contractorId=${FIRST}`,
      '?status=late',
      '?status=open&status=open',
      `?${manyContractors}`,
      '?companyId=x',
      '?limit=101',
      '?limit=10&limit=20',
    ]
    for (const query of refused) expect((await fixture.list(query)).status).toBe(400)
    expect(fixture.calls).toEqual([])
  })
})

describe('ordenação no servidor da lista de chegadas (spec 237, M3)', () => {
  test('cada coluna fechada, nos dois sentidos; coluna ou sentido fora da lista é 400', async () => {
    const fixture = createListFixture()
    const sorts = ['arrivedAt', 'contractorName', 'separationDueAt', 'status']
    for (const sort of sorts) {
      for (const direction of ['asc', 'desc']) {
        expect((await fixture.list(`?sort=${sort}&direction=${direction}`)).status).toBe(200)
      }
    }
    expect(fixture.calls.map((call) => (call as { order: unknown }).order)).toEqual(
      sorts.flatMap((sort) => [
        { direction: 'asc', sort },
        { direction: 'desc', sort },
      ]),
    )
    for (const query of ['?sort=progress', '?direction=up', '?sort=status&sort=arrivedAt']) {
      expect((await fixture.list(query)).status).toBe(400)
    }
  })

  test('o cursor só anda na ordem em que nasceu; outra ordem é 400 com código estável', async () => {
    const fixture = createListFixture()
    const byName = encodeCargoArrivalListCursor({
      cursor: { id: ROW_ID, value: 'Contratante B' },
      order: { direction: 'asc', sort: 'contractorName' },
    })
    const legacy = `2026-10-05T12:00:00.000Z::${ROW_ID}`

    expect((await fixture.list(`?sort=contractorName&direction=asc&cursor=${byName}`)).status).toBe(
      200,
    )
    expect((await fixture.list(`?cursor=${encodeURIComponent(legacy)}`)).status).toBe(200)
    expect(fixture.calls).toEqual([
      expect.objectContaining({
        paging: { cursor: { id: ROW_ID, value: 'Contratante B' }, limit: 25 },
      }),
      expect.objectContaining({
        paging: { cursor: { id: ROW_ID, value: '2026-10-05T12:00:00.000Z' }, limit: 25 },
      }),
    ])

    const mismatches = [
      `?sort=contractorName&direction=desc&cursor=${byName}`,
      `?sort=status&direction=asc&cursor=${byName}`,
      `?cursor=${byName}`,
      `?sort=contractorName&direction=asc&cursor=${encodeURIComponent(legacy)}`,
    ]
    for (const query of mismatches) {
      const response = await fixture.list(query)
      expect(response.status).toBe(400)
      expect((await responseApiError(response)).code).toBe('CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH')
    }
    const garbage = await fixture.list('?sort=status&direction=asc&cursor=bm90LWpzb24')
    expect(garbage.status).toBe(400)
    expect((await responseApiError(garbage)).code).toBe('INVALID_REQUEST')
    expect(fixture.calls).toHaveLength(2)
  })
})
