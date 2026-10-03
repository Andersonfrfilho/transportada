/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: ler a chegada é `fleet.read`, escrever é `trip.manage` (o separador tem as duas);
 * o corpo é estrito, a empresa vem do contexto e todo campo inválido volta de uma vez.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoArrivalRoutes } from '../../src/cargo-receiving/presentation/cargo-arrival.routes.js'
import { createCargoArrivalSeparationRoutes } from '../../src/cargo-receiving/presentation/cargo-arrival-separation.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/freight-region-http.fixture.js'

const ARRIVAL_ID = '00000000-0000-4000-8000-000000000f01'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000f02'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000f03'
const KEY = 'arrival-key-000000001'
const SEPARATOR: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'trip.read',
  'trip.manage',
  'invoices.read',
])
const READER: CompanyContext['permissions'] = new Set(['fleet.read'])
const BODY = {
  arrivedAt: '2026-10-03T08:00:00.000Z',
  contractorId: CONTRACTOR_ID,
  documentIds: [DOCUMENT_ID],
  palletCount: 3,
}

type Calls = Record<string, unknown[]>

function createFixture(input: {
  readonly isReplay?: boolean
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: Calls = {}
  const record = (name: string, result: unknown) => ({
    async execute(params: unknown) {
      ;(calls[name] ??= []).push(params)
      return result
    },
  })
  const page = { items: [], nextCursor: null }
  const routes = [
    ...createCargoArrivalRoutes({
      getArrival: record('get', { id: ARRIVAL_ID }) as never,
      listArrivals: record('list', page) as never,
      listAvailableDocuments: record('available', page) as never,
      registerArrival: record('register', {
        arrival: { id: ARRIVAL_ID },
        isReplay: input.isReplay ?? false,
      }) as never,
    }),
    ...createCargoArrivalSeparationRoutes({
      assignRoute: record('route', { results: [] }) as never,
      batchStatus: record('batch', { results: [] }) as never,
      changeDocumentState: record('change', { outcome: 'changed' }) as never,
      closeArrival: record('close', { outcome: 'changed' }) as never,
    }),
  ]
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? SEPARATOR),
      routes,
    }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function post(path: string, body: unknown, key: string | null = KEY): Request {
  const request = jsonRequest({ body, method: 'POST', path })
  if (key === null) return request
  const headers = new Headers(request.headers)
  headers.set('idempotency-key', key)
  return new Request(request, { headers })
}

type ErrorBody = { readonly error: { readonly details?: readonly { readonly field: string }[] } }

async function fieldsOf(response: Response): Promise<string[]> {
  const payload = (await response.json()) as ErrorBody
  return (payload.error.details ?? []).map((detail) => detail.field).sort()
}

describe('registrar a chegada por HTTP (spec 237 T2.3)', () => {
  test('201 na criação, com contexto, chave e data convertida', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(post('/cargo-arrivals', BODY))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: ARRIVAL_ID } })
    expect(fixture.calls.register).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: SEPARATOR },
        correlationId: CORRELATION_ID,
        idempotencyKey: KEY,
        input: {
          arrivedAt: new Date(BODY.arrivedAt),
          contractorId: CONTRACTOR_ID,
          documentIds: [DOCUMENT_ID],
          palletCount: 3,
          reference: null,
        },
      },
    ])
  })

  test('a repetição responde 200, não 201', async () => {
    const response = await createFixture({ isReplay: true }).handle(post('/cargo-arrivals', BODY))
    expect(response.status).toBe(200)
  })

  test('sem chave e com corpo inválido, todos os campos voltam juntos', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      post(
        '/cargo-arrivals',
        {
          ...BODY,
          arrivedAt: 'ontem',
          documentIds: [],
          palletCount: -1,
          reference: 'x'.repeat(121),
        },
        null,
      ),
    )

    expect(response.status).toBe(400)
    expect(await fieldsOf(response)).toEqual([
      'Idempotency-Key',
      'arrivedAt',
      'documentIds',
      'palletCount',
      'reference',
    ])
    expect(fixture.calls.register).toBeUndefined()
  })

  test.each([
    ['companyId no corpo', { ...BODY, companyId: CONTRACTOR_ID }],
    [
      'mais de 300 notas',
      { ...BODY, documentIds: Array.from({ length: 301 }, () => crypto.randomUUID()) },
    ],
    ['nota repetida', { ...BODY, documentIds: [DOCUMENT_ID, DOCUMENT_ID] }],
    ['data sem fuso', { ...BODY, arrivedAt: '2026-10-03T08:00:00' }],
  ])('%s é 400', async (_label, body) => {
    const fixture = createFixture({})
    expect((await fixture.handle(post('/cargo-arrivals', body))).status).toBe(400)
    expect(fixture.calls.register).toBeUndefined()
  })

  test('chave curta demais é 400', async () => {
    expect((await createFixture({}).handle(post('/cargo-arrivals', BODY, 'curta'))).status).toBe(
      400,
    )
  })
})

describe('as permissões da chegada (spec 237 T2.3)', () => {
  test('quem só lê a frota lê a chegada e as candidatas, mas não escreve nada', async () => {
    const fixture = createFixture({ permissions: READER })
    const reads = [
      `/cargo-arrivals/available-documents?contractorId=${CONTRACTOR_ID}`,
      '/cargo-arrivals',
      `/cargo-arrivals/${ARRIVAL_ID}`,
    ]
    for (const path of reads) {
      expect((await fixture.handle(jsonRequest({ method: 'GET', path }))).status).toBe(200)
    }
    const writes = [
      post('/cargo-arrivals', BODY),
      post(`/cargo-arrivals/${ARRIVAL_ID}/documents/${DOCUMENT_ID}/receive`, undefined, null),
      post(`/cargo-arrivals/${ARRIVAL_ID}/documents/batch-status`, {
        documentIds: [DOCUMENT_ID],
        to: 'received',
      }),
      post(`/cargo-arrivals/${ARRIVAL_ID}/route-assignment`, {
        documentIds: [DOCUMENT_ID],
        routeName: null,
      }),
      post(`/cargo-arrivals/${ARRIVAL_ID}/close`, undefined, null),
    ]
    for (const request of writes) {
      const response = await fixture.handle(request)
      expect(response.status).toBe(403)
      expect((await responseApiError(response)).code).toBe('FORBIDDEN')
    }
    expect(Object.keys(fixture.calls).sort()).toEqual(['available', 'get', 'list'])
  })
})

describe('ler e separar por HTTP (spec 237 T2.3)', () => {
  test('as candidatas exigem o contratante e limitam a página a 100', async () => {
    const fixture = createFixture({})
    const missing = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/cargo-arrivals/available-documents' }),
    )
    expect(missing.status).toBe(400)
    const tooMany = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `/cargo-arrivals/available-documents?contractorId=${CONTRACTOR_ID}&limit=101`,
      }),
    )
    expect(tooMany.status).toBe(400)
    const unknown = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/cargo-arrivals?companyId=x' }),
    )
    expect(unknown.status).toBe(400)
  })

  test('receber e separar chamam o mesmo caso de uso com o alvo da rota', async () => {
    const fixture = createFixture({})
    const base = `/cargo-arrivals/${ARRIVAL_ID}/documents/${DOCUMENT_ID}`
    expect((await fixture.handle(post(`${base}/receive`, undefined, null))).status).toBe(200)
    expect((await fixture.handle(post(`${base}/separate`, undefined, null))).status).toBe(200)

    expect(fixture.calls.change).toEqual([
      expect.objectContaining({ arrivalId: ARRIVAL_ID, documentId: DOCUMENT_ID, to: 'received' }),
      expect.objectContaining({ arrivalId: ARRIVAL_ID, documentId: DOCUMENT_ID, to: 'separated' }),
    ])
  })

  test('lote e rota recusam alvo desconhecido, rota longa e nota repetida, todos juntos', async () => {
    const fixture = createFixture({})
    const batch = await fixture.handle(
      post(`/cargo-arrivals/${ARRIVAL_ID}/documents/batch-status`, {
        documentIds: [DOCUMENT_ID, DOCUMENT_ID],
        to: 'loaded',
      }),
    )
    expect(await fieldsOf(batch)).toEqual(['documentIds', 'to'])
    const route = await fixture.handle(
      post(`/cargo-arrivals/${ARRIVAL_ID}/route-assignment`, {
        documentIds: [DOCUMENT_ID],
        routeName: 'x'.repeat(41),
      }),
    )
    expect(await fieldsOf(route)).toEqual(['routeName'])
    expect(fixture.calls.batch).toBeUndefined()
    expect(fixture.calls.route).toBeUndefined()
  })

  test('limpar a rota com null é aceito', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      post(`/cargo-arrivals/${ARRIVAL_ID}/route-assignment`, {
        documentIds: [DOCUMENT_ID],
        routeName: null,
      }),
    )
    expect(response.status).toBe(200)
    expect(fixture.calls.route).toEqual([
      expect.objectContaining({ documentIds: [DOCUMENT_ID], routeName: null }),
    ])
  })
})
