/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'

const API_URL = 'https://api.example.test'
const OCCURRENCE_ID = 'occurrence-1'
const ACCESS_TOKEN = 'synthetic-token'
const DECISION_PATH = `${API_URL}/trip-occurrences/${OCCURRENCE_ID}/case/decision`

/** O corpo REAL das seis ações da tratativa (`occurrence-case.routes.ts`): `{ kind, status }`, nunca a visão completa. */
const ACTION_RESULT = { kind: 'changed', status: 'decided' } as const

function createClient(input: { readonly requests: Request[]; readonly response?: Response }) {
  return createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: (resource, init) => {
      const request = new Request(resource, init)
      input.requests.push(request)
      return Promise.resolve(input.response ?? Response.json({ data: ACTION_RESULT }))
    },
    getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
  })
}

/**
 * Spec 164, achado 1: `POST /trip-occurrences/:id/case/decision` — o escritório decide em nome da
 * contratante que não respondeu. Rota nova é contrato: cliente HTTP (caminho, método, corpo) e o
 * guard de chave exata que valida a resposta precisam de teste próprio.
 */
describe('cliente HTTP: decisão em nome do contratante', () => {
  test('envia kind e note para o caminho .../case/decision, autenticado e sem cache', async () => {
    const requests: Request[] = []
    const client = createClient({ requests })

    const result = await client.decideOccurrenceCaseOnBehalfOfContractor({
      kind: 'goods_paid',
      note: 'Cliente não respondeu em 5 dias úteis.',
      occurrenceId: OCCURRENCE_ID,
    })

    expect(result).toEqual(ACTION_RESULT)
    const [request] = requests
    if (request === undefined) throw new Error('OCCURRENCE_DECISION_REQUEST_MISSING')

    expect(request.url).toBe(DECISION_PATH)
    expect(request.method).toBe('POST')
    expect(request.cache).toBe('no-store')
    expect(request.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(await request.json()).toEqual({
      kind: 'goods_paid',
      note: 'Cliente não respondeu em 5 dias úteis.',
    })
  })

  test('surfaces o código de erro do conflito de decisão divergente (409)', async () => {
    const client = createClient({
      requests: [],
      response: Response.json(
        { error: { code: 'OCCURRENCE_CASE_DECISION_CONFLICT', message: 'conflict' } },
        { status: 409 },
      ),
    })

    const caught = await client
      .decideOccurrenceCaseOnBehalfOfContractor({
        kind: 'other',
        note: 'motivo',
        occurrenceId: OCCURRENCE_ID,
      })
      .catch((error: unknown) => error)

    expect(caught).toEqual(
      expect.objectContaining({ message: 'OCCURRENCE_CASE_DECISION_CONFLICT' }),
    )
  })

  test('surfaces o código de erro de reentrega bloqueada (422)', async () => {
    const client = createClient({
      requests: [],
      response: Response.json(
        { error: { code: 'OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED', message: 'blocked' } },
        { status: 422 },
      ),
    })

    const caught = await client
      .decideOccurrenceCaseOnBehalfOfContractor({
        kind: 'redelivery_authorized',
        note: 'motivo',
        occurrenceId: OCCURRENCE_ID,
      })
      .catch((error: unknown) => error)

    expect(caught).toEqual(
      expect.objectContaining({ message: 'OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED' }),
    )
  })

  test('guard: resposta sem kind/status válidos é TRIP_RESPONSE_INVALID', async () => {
    const invalidBodies = [
      { status: 'decided' },
      { kind: 'changed' },
      { kind: 'exploded', status: 'decided' },
      { kind: 'changed', status: 42 },
    ]
    for (const body of invalidBodies) {
      const client = createClient({ requests: [], response: Response.json({ data: body }) })

      const caught = await client
        .decideOccurrenceCaseOnBehalfOfContractor({
          kind: 'other',
          note: 'motivo',
          occurrenceId: OCCURRENCE_ID,
        })
        .catch((error: unknown) => error)

      expect(caught).toEqual(expect.objectContaining({ message: 'TRIP_RESPONSE_INVALID' }))
    }
  })
})

describe('cliente HTTP: as seis ações da tratativa leem o corpo real { kind, status }', () => {
  const ACTIONS = [
    { call: 'reviewOccurrenceCase', path: 'review', input: {} },
    { call: 'returnOccurrenceCaseToWarehouse', path: 'warehouse-return', input: { note: 'n' } },
    { call: 'submitOccurrenceCaseToContractor', path: 'contractor-submission', input: {} },
    { call: 'closeOccurrenceCase', path: 'closure', input: {} },
    { call: 'cancelOccurrenceCase', path: 'cancel', input: { note: 'n' } },
    {
      call: 'decideOccurrenceCaseOnBehalfOfContractor',
      path: 'decision',
      input: { kind: 'goods_paid', note: 'n' },
    },
  ] as const

  for (const action of ACTIONS) {
    test(`${action.call}: resolve com o resultado, e kind 'unchanged' também vale`, async () => {
      for (const kind of ['changed', 'unchanged'] as const) {
        const requests: Request[] = []
        const client = createClient({
          requests,
          response: Response.json({ data: { kind, status: 'under_review' } }),
        })
        const call = client[action.call] as (input: object) => Promise<unknown>

        const result = await call({ ...action.input, occurrenceId: OCCURRENCE_ID })

        expect(result).toEqual({ kind, status: 'under_review' })
        expect(requests[0]?.url).toBe(
          `${API_URL}/trip-occurrences/${OCCURRENCE_ID}/case/${action.path}`,
        )
      }
    })
  }
})
