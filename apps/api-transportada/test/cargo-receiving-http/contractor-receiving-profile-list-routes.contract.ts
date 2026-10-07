/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M4): o painel descobre numa leitura só quais contratantes têm o
 * recebimento ligado — antes era uma requisição por contratante. `fleet.read`, empresa do contexto,
 * cursor pelo id do contratante e no máximo 100 por página.
 */
import { describe, expect, test } from 'bun:test'

import { createContractorReceivingProfileListRoutes } from '../../src/cargo-receiving/presentation/contractor-receiving-profile-list.routes.js'
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

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000b21'
const READER: CompanyContext['permissions'] = new Set(['fleet.read'])
const SUMMARY = { contractorId: CONTRACTOR_ID, isEnabled: true, previewEnabled: false }

function createFixture(permissions: CompanyContext['permissions'] = READER) {
  const calls: unknown[] = []
  const routes = createContractorReceivingProfileListRoutes({
    listProfiles: {
      async execute(params) {
        calls.push(params)
        return { items: [SUMMARY], nextCursor: CONTRACTOR_ID }
      },
    },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(permissions), routes }),
  })
  const list = (query: string) =>
    handleRequest(jsonRequest({ method: 'GET', path: `/contractor-receiving-profiles${query}` }), {
      timeout() {},
    })
  return { calls, list }
}

describe('a lista dos perfis de recebimento (spec 237, M4)', () => {
  test('devolve o resumo e o cursor, com a empresa do contexto e o filtro pedido', async () => {
    const fixture = createFixture()
    const response = await fixture.list(`?enabled=true&limit=100&cursor=${CONTRACTOR_ID}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [SUMMARY], nextCursor: CONTRACTOR_ID })
    await fixture.list('')
    expect(fixture.calls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: READER },
        enabled: true,
        paging: { cursor: CONTRACTOR_ID, limit: 100 },
      },
      { context: { ...COMPANY_CONTEXT, permissions: READER }, paging: { cursor: null, limit: 25 } },
    ])
  })

  test('recusa filtro, página, cursor e chave fora do contrato sem chamar o caso de uso', async () => {
    const fixture = createFixture()
    const refused = [
      '?enabled=yes',
      '?limit=101',
      '?cursor=2026-10-05T12:00:00.000Z::x',
      '?enabled=true&enabled=false',
      '?companyId=x',
    ]
    for (const query of refused) expect((await fixture.list(query)).status).toBe(400)
    expect(fixture.calls).toEqual([])
  })

  test('quem não lê a frota não lê os perfis', async () => {
    const fixture = createFixture(new Set(['invoices.read']))
    expect((await fixture.list('?enabled=true')).status).toBe(403)
    expect(fixture.calls).toEqual([])
  })
})
