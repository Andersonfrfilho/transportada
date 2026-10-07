/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9.4–9.5): a avaria sem viagem é multipart com `Idempotency-Key`, ler é
 * `fleet.read`, abrir/marcar/concluir é `trip.manage`, e DESFAZER a marcação é `occurrences.resolve`
 * — o separador que registrou a avaria não manda a caixa de volta à rota sozinho.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoArrivalOccurrenceRoutes } from '../../src/cargo-receiving/presentation/cargo-arrival-occurrence.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const ARRIVAL_ID = '00000000-0000-4000-8000-000000000f11'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000f12'
const TYPE_ID = '00000000-0000-4000-8000-000000000f13'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000f14'
const KEY = 'occurrence-key-0000001'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const BASE = `/cargo-arrivals/${ARRIVAL_ID}/documents/${DOCUMENT_ID}`

const SEPARATOR: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'trip.read',
  'trip.manage',
  'invoices.read',
])
const READER: CompanyContext['permissions'] = new Set(['fleet.read'])
const OFFICE: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'trip.manage',
  'occurrences.resolve',
])

function createFixture(input: {
  readonly isReplay?: boolean
  readonly permissions: CompanyContext['permissions']
}) {
  const calls: Record<string, unknown[]> = {}
  const record = (name: string, result: unknown) => ({
    async execute(params: unknown) {
      ;(calls[name] ??= []).push(params)
      return result
    },
  })
  const routes = createCargoArrivalOccurrenceRoutes({
    changeReturn: record('return', { outcome: 'changed' }) as never,
    listOccurrences: record('list', { documents: [] }) as never,
    listTypes: record('types', []) as never,
    registerOccurrence: record('register', {
      isReplay: input.isReplay ?? false,
      occurrence: { id: OCCURRENCE_ID },
    }) as never,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(input.permissions), routes }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function multipart(fields: Record<string, string>, key: string | null = KEY): Request {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  form.append('file', new File([JPEG], 'avaria.jpg', { type: 'image/jpeg' }))
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    'x-correlation-id': CORRELATION_ID,
  }
  if (key !== null) headers['idempotency-key'] = key
  return new Request(`${FRONTEND_ORIGIN}${BASE}/occurrences`, {
    body: form,
    headers,
    method: 'POST',
  })
}

const FIELDS = {
  note: 'caixa amassada',
  occurrenceTypeId: TYPE_ID,
  productCodes: 'P1',
  productQuantities: '2',
  productQuantityUnits: 'CX',
}

describe('abrir a ocorrência de recebimento por HTTP (spec 237 T3.2)', () => {
  test('201 na criação, com contexto, chave, foto e itens; 200 no reenvio', async () => {
    const fixture = createFixture({ permissions: SEPARATOR })
    const response = await fixture.handle(multipart(FIELDS))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: OCCURRENCE_ID } })
    expect(fixture.calls.register).toEqual([
      expect.objectContaining({
        arrivalId: ARRIVAL_ID,
        context: { ...COMPANY_CONTEXT, permissions: SEPARATOR },
        correlationId: CORRELATION_ID,
        documentId: DOCUMENT_ID,
        idempotencyKey: KEY,
        note: 'caixa amassada',
        occurrenceTypeId: TYPE_ID,
        productCodes: ['P1'],
        productQuantities: ['2'],
        productQuantityUnits: ['CX'],
      }),
    ])
    const replay = createFixture({ isReplay: true, permissions: SEPARATOR })
    expect((await replay.handle(multipart(FIELDS))).status).toBe(200)
  })

  test.each([
    ['sem Idempotency-Key', multipart(FIELDS, null)],
    ['campo fora da lista', multipart({ ...FIELDS, stage: 'separation' })],
    [
      'corpo JSON',
      jsonRequest({
        body: { occurrenceTypeId: TYPE_ID },
        method: 'POST',
        path: `${BASE}/occurrences`,
      }),
    ],
  ])('%s é 400 sem chamar o caso de uso', async (_label, request) => {
    const fixture = createFixture({ permissions: SEPARATOR })
    expect((await fixture.handle(request)).status).toBe(400)
    expect(fixture.calls.register).toBeUndefined()
  })

  test('quem só lê não abre ocorrência', async () => {
    const fixture = createFixture({ permissions: READER })
    expect((await fixture.handle(multipart(FIELDS))).status).toBe(403)
  })
})

describe('ler as ocorrências e os tipos de recebimento (spec 237 T3.2)', () => {
  test('a lista é fleet.read, com o filtro opcional por nota', async () => {
    const fixture = createFixture({ permissions: READER })
    const all = await fixture.handle(
      jsonRequest({ method: 'GET', path: `/cargo-arrivals/${ARRIVAL_ID}/occurrences` }),
    )
    const one = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `/cargo-arrivals/${ARRIVAL_ID}/occurrences?documentId=${DOCUMENT_ID}`,
      }),
    )

    expect([all.status, one.status]).toEqual([200, 200])
    expect(fixture.calls.list).toEqual([
      { arrivalId: ARRIVAL_ID, context: expect.anything(), documentId: null },
      { arrivalId: ARRIVAL_ID, context: expect.anything(), documentId: DOCUMENT_ID },
    ])
  })

  test('query desconhecida ou nota que não é UUID é 400', async () => {
    const fixture = createFixture({ permissions: READER })
    for (const query of ['companyId=x', 'documentId=nao-e-uuid']) {
      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: `/cargo-arrivals/${ARRIVAL_ID}/occurrences?${query}` }),
      )
      expect(response.status).toBe(400)
    }
  })

  test('os tipos de recebimento são fleet.read', async () => {
    const reader = createFixture({ permissions: READER })
    const nobody = createFixture({ permissions: new Set() })
    const request = () => jsonRequest({ method: 'GET', path: '/cargo-arrivals/occurrence-types' })

    expect((await reader.handle(request())).status).toBe(200)
    expect((await nobody.handle(request())).status).toBe(403)
  })
})

describe('marcar, desfazer e concluir a devolução por HTTP (spec 237 RF8a)', () => {
  const body = (path: string, payload: unknown) =>
    jsonRequest({ body: payload, method: 'POST', path: `${BASE}/${path}` })

  test('marcar é trip.manage e exige a ocorrência de origem', async () => {
    const fixture = createFixture({ permissions: SEPARATOR })
    const response = await fixture.handle(body('return-mark', { occurrenceId: OCCURRENCE_ID }))

    expect(response.status).toBe(200)
    expect(fixture.calls.return).toEqual([
      expect.objectContaining({
        action: 'mark',
        arrivalId: ARRIVAL_ID,
        documentId: DOCUMENT_ID,
        note: '',
        occurrenceId: OCCURRENCE_ID,
      }),
    ])
    expect((await fixture.handle(body('return-mark', {}))).status).toBe(400)
    expect(
      (
        await fixture.handle(
          body('return-mark', { occurrenceId: OCCURRENCE_ID, state: 'returned' }),
        )
      ).status,
    ).toBe(400)
  })

  test('desfazer é occurrences.resolve: o separador recebe 403', async () => {
    const separator = createFixture({ permissions: SEPARATOR })
    const office = createFixture({ permissions: OFFICE })

    expect((await separator.handle(body('return-unmark', {}))).status).toBe(403)
    expect((await office.handle(body('return-unmark', { note: 'cliente aceitou' }))).status).toBe(
      200,
    )
    expect(office.calls.return).toEqual([
      expect.objectContaining({ action: 'unmark', note: 'cliente aceitou', occurrenceId: null }),
    ])
  })

  test('concluir é trip.manage; quem só lê recebe 403', async () => {
    const separator = createFixture({ permissions: SEPARATOR })
    const reader = createFixture({ permissions: READER })

    expect((await separator.handle(body('return-complete', {}))).status).toBe(200)
    expect(separator.calls.return).toEqual([expect.objectContaining({ action: 'complete' })])
    expect((await reader.handle(body('return-complete', {}))).status).toBe(403)
  })
})
