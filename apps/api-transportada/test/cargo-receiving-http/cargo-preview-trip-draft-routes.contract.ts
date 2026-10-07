/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1: `GET /cargo-previews/:id/trip-drafts` é leitura (`fleet.read`, que o separador tem), não
 * aceita query nem corpo, e o `:id` canônico é UUID (outro formato nem casa a rota). Nada vira viagem aqui: a rota só lê.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoPreviewTripDraftRoutes } from '../../src/cargo-receiving/presentation/cargo-preview-trip-draft.routes.js'
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

const PREVIEW_ID = '00000000-0000-4000-8000-000000000f02'
const READER: CompanyContext['permissions'] = new Set(['fleet.read'])
const NO_ACCESS: CompanyContext['permissions'] = new Set(['invoices.read'])

function createFixture(permissions: CompanyContext['permissions']) {
  const calls: unknown[] = []
  const routes = createCargoPreviewTripDraftRoutes({
    getTripDrafts: {
      async execute(params: unknown) {
        calls.push(params)
        return { previewId: PREVIEW_ID }
      },
    } as never,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(permissions), routes }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

const get = (path: string): Request => jsonRequest({ method: 'GET', path })

describe('os rascunhos de viagem da prévia por HTTP (spec 237 T5.1)', () => {
  test('quem lê a frota lê os rascunhos: 200 com o contexto e o id', async () => {
    const fixture = createFixture(READER)

    const response = await fixture.handle(get(`/cargo-previews/${PREVIEW_ID}/trip-drafts`))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { previewId: PREVIEW_ID } })
    expect(fixture.calls).toEqual([
      { context: { ...COMPANY_CONTEXT, permissions: READER }, previewId: PREVIEW_ID },
    ])
  })

  test('sem `fleet.read` é 403, e o caso de uso nem roda', async () => {
    const fixture = createFixture(NO_ACCESS)

    const response = await fixture.handle(get(`/cargo-previews/${PREVIEW_ID}/trip-drafts`))

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).code).toBe('FORBIDDEN')
    expect(fixture.calls).toEqual([])
  })

  test('id que não é UUID não casa a rota: 404, e o caso de uso nem roda', async () => {
    const fixture = createFixture(READER)

    const response = await fixture.handle(get('/cargo-previews/nao-e-uuid/trip-drafts'))

    expect(response.status).toBe(404)
    expect(fixture.calls).toEqual([])
  })

  test.each(['companyId=x', 'limit=10', 'routeName=FR.S.CAR'])(
    'query %s é 400: a empresa vem do contexto e a leitura não filtra',
    async (query) => {
      const fixture = createFixture(READER)

      const response = await fixture.handle(
        get(`/cargo-previews/${PREVIEW_ID}/trip-drafts?${query}`),
      )

      expect(response.status).toBe(400)
      expect(fixture.calls).toEqual([])
    },
  )

  test('a rota só existe como GET: criar viagem por aqui não é possível', async () => {
    const fixture = createFixture(READER)

    const response = await fixture.handle(
      jsonRequest({ body: {}, method: 'POST', path: `/cargo-previews/${PREVIEW_ID}/trip-drafts` }),
    )

    expect(response.status).not.toBe(200)
    expect(response.status).not.toBe(201)
    expect(fixture.calls).toEqual([])
  })
})
