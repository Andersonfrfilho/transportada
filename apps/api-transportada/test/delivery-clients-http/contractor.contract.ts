/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { Contractor } from '../../src/delivery-clients/application/contractor.port.js'
import { createContractorRoutes } from '../../src/delivery-clients/presentation/contractor.routes.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/freight-region-http.fixture.js'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000701'

const CONTRACTOR: Contractor = {
  closingPeriod: 'monthly',
  displayName: 'Spani Atacadista',
  id: CONTRACTOR_ID,
  notes: '',
  reportEmail: 'contas@spani.test',
  status: 'active',
  taxId: '30290856000160',
}

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: Record<string, unknown[]> = {
    create: [],
    update: [],
  }

  const record = <TResult>(name: string, result: TResult) => ({
    async execute(input: Record<string, unknown>) {
      calls[name]?.push(structuredClone(input))
      return result
    },
  })

  const routes = createContractorRoutes({
    createContractor: record('create', CONTRACTOR),
    getByTaxId: record('getByTaxId', CONTRACTOR),
    getContractor: record('getContractor', CONTRACTOR),
    listContractors: record('listContractors', { items: [CONTRACTOR], nextCursor: null }),
    updateContractor: record('update', CONTRACTOR),
  })

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(permissions ?? COMPANY_CONTEXT.permissions),
      routes,
    }),
  })

  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('as rotas do contratante (spec 060 T008)', () => {
  test('cria o contratante com o documento canonicalizado', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { closingPeriod: 'fortnightly', taxId: '30.290.856-0001-60' },
        method: 'POST',
        path: '/contractors',
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.calls.create).toEqual([
      {
        context: COMPANY_CONTEXT,
        taxId: '30290856000160',
        values: { closingPeriod: 'fortnightly' },
      },
    ])
  })

  /** Vazio é lote que se exporta à mão, e é o padrão: recusá-lo obrigaria a inventar um e-mail. */
  test('aceita relatório sem destinatário, e recusa endereço inválido', async () => {
    const fixture = createFixture()

    const empty = await fixture.handle(
      jsonRequest({
        body: { reportEmail: '' },
        method: 'PATCH',
        path: `/contractors/${CONTRACTOR_ID}`,
      }),
    )
    expect(empty.status).toBe(200)

    const invalid = await fixture.handle(
      jsonRequest({
        body: { reportEmail: 'não-é-email' },
        method: 'PATCH',
        path: `/contractors/${CONTRACTOR_ID}`,
      }),
    )
    expect(invalid.status).toBe(400)
  })

  /**
   * Ler é `fleet.read` porque o roteiro consulta; escrever é `settings.manage` porque o período de
   * fechamento e o destinatário do relatório decidem para quem o dinheiro é cobrado. As rotas do
   * feriado do município (mesma regra de permissão) estão em `test/business-calendar-rules/`.
   */
  test('quem cuida da frota lê, mas não muda o período de fechamento', async () => {
    const fixture = createFixture(new Set(['fleet.read', 'fleet.manage']))

    expect(
      (await fixture.handle(jsonRequest({ method: 'GET', path: '/contractors' }))).status,
    ).toBe(200)
    const refused = await fixture.handle(
      jsonRequest({
        body: { closingPeriod: 'fortnightly' },
        method: 'PATCH',
        path: `/contractors/${CONTRACTOR_ID}`,
      }),
    )
    expect(refused.status).toBe(403)
    expect((await responseApiError(refused)).code).toBe('FORBIDDEN')
  })
})
