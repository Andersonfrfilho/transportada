/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { DeliveryClientEmail } from '../../src/delivery-clients/application/delivery-client-email.port.js'
import {
  DeliveryClientEmailLimitReachedError,
  DeliveryClientNotFoundError,
} from '../../src/delivery-clients/domain/delivery-client.error.js'
import { createDeliveryClientEmailRoutes } from '../../src/delivery-clients/presentation/delivery-client-email.routes.js'
import { CLIENT_TAX_ID, READ_ONLY_PERMISSIONS } from '../fixtures/delivery-client-http.fixture.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture.js'

const EMAIL_ID = '00000000-0000-4000-8000-000000000811'
const EMAILS_PATH = `/delivery-clients/${CLIENT_TAX_ID}/emails`

const EMAIL: DeliveryClientEmail = {
  addressMasked: 'c***@m***.test',
  createdAt: new Date('2026-10-26T20:00:00.000Z'),
  createdByKind: 'office',
  id: EMAIL_ID,
  label: 'financeiro',
  purpose: 'boleto',
}

function createFixture(
  params: { readonly error?: Error; readonly permissions?: CompanyContext['permissions'] } = {},
) {
  const calls: Record<string, unknown[]> = { add: [], list: [], remove: [], updateLabel: [] }

  function record<TResult>(name: string, result: TResult) {
    return {
      async execute(input: Record<string, unknown>) {
        calls[name]?.push(structuredClone(input))
        if (params.error !== undefined) throw params.error
        return result
      },
    }
  }

  const routes = createDeliveryClientEmailRoutes({
    addEmail: record('add', EMAIL),
    listEmails: record('list', [EMAIL]),
    removeEmail: record('remove', undefined),
    resolveClientIp: () => '203.0.113.9',
    updateEmailLabel: record('updateLabel', EMAIL),
  })

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
      routes,
    }),
  })

  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

const ACTOR = {
  companyId: COMPANY_CONTEXT.companyId,
  correlationId: CORRELATION_ID,
  ipAddress: '203.0.113.9',
  userId: COMPANY_CONTEXT.userId,
}

describe('as rotas dos e-mails do cliente de entrega (spec 279 T2)', () => {
  test('lista só a forma mascarada, nunca o endereço, e filtra pelo tipo', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${EMAILS_PATH}?type=boleto` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual([
      {
        addressMasked: 'c***@m***.test',
        createdAt: '2026-10-26T20:00:00.000Z',
        createdByKind: 'office',
        id: EMAIL_ID,
        label: 'financeiro',
        purpose: 'boleto',
      },
    ])
    expect(fixture.calls.list).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, purpose: 'boleto', taxId: CLIENT_TAX_ID },
    ])
  })

  test('sem `type` lista todos os tipos; tipo fora do vocabulário é recusado', async () => {
    const fixture = createFixture()

    await fixture.handle(jsonRequest({ method: 'GET', path: EMAILS_PATH }))
    expect(fixture.calls.list).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, taxId: CLIENT_TAX_ID },
    ])

    const refused = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${EMAILS_PATH}?type=newsletter` }),
    )
    expect(refused.status).toBe(400)
  })

  test('documento fora de forma é ausência, não 400', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/delivery-clients/abc/emails' }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('DELIVERY_CLIENT_NOT_FOUND')
    expect(fixture.calls.list).toEqual([])
  })

  test('cadastra com o ator, o tipo e o rótulo aparado; responde 201 mascarado', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { address: '  contas@mercado.test ', label: ' financeiro ', purpose: 'boleto' },
        method: 'POST',
        path: EMAILS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(JSON.stringify(await response.json())).not.toContain('contas@mercado.test')
    expect(fixture.calls.add).toEqual([
      {
        actor: ACTOR,
        address: 'contas@mercado.test',
        label: 'financeiro',
        purpose: 'boleto',
        taxId: CLIENT_TAX_ID,
      },
    ])
  })

  test.each([
    ['sem arroba', 'contasmercado.test'],
    ['com vírgula', 'a@mercado.test,b@mercado.test'],
    ['com ponto e vírgula', 'a@mercado.test;b@mercado.test'],
    ['com sinais de menor e maior', 'Contas <a@mercado.test>'],
    ['com quebra de linha', 'a@mercado.test\r\nbcc:x@y.test'],
    ['sem ponto no domínio', 'a@mercado'],
    ['acima de 254 caracteres', `${'a'.repeat(250)}@m.test`],
  ])('recusa o endereço %s', async (_name, address) => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { address, purpose: 'boleto' },
        method: 'POST',
        path: EMAILS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.calls.add).toEqual([])
  })

  test('recusa tipo inexistente, campo desconhecido e rótulo acima de 60', async () => {
    const fixture = createFixture()
    const post = (body: object) =>
      fixture.handle(jsonRequest({ body, method: 'POST', path: EMAILS_PATH }))

    expect((await post({ address: 'a@m.test', purpose: 'spam' })).status).toBe(400)
    expect((await post({ address: 'a@m.test' })).status).toBe(400)
    expect((await post({ address: 'a@m.test', extra: 1, purpose: 'boleto' })).status).toBe(400)
    expect(
      (await post({ address: 'a@m.test', label: 'x'.repeat(61), purpose: 'boleto' })).status,
    ).toBe(400)
    expect(fixture.calls.add).toEqual([])
  })

  test('o limite de 10 por tipo volta como 422 com código estável', async () => {
    const fixture = createFixture({ error: new DeliveryClientEmailLimitReachedError(10) })

    const response = await fixture.handle(
      jsonRequest({
        body: { address: 'a@mercado.test', purpose: 'boleto' },
        method: 'POST',
        path: EMAILS_PATH,
      }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('DELIVERY_CLIENT_EMAIL_LIMIT_REACHED')
  })

  test('cliente de outra empresa é 404, sem dizer que existe', async () => {
    const fixture = createFixture({ error: new DeliveryClientNotFoundError() })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: EMAILS_PATH }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('DELIVERY_CLIENT_NOT_FOUND')
  })

  test('edita só o rótulo e remove por id', async () => {
    const fixture = createFixture()

    const patched = await fixture.handle(
      jsonRequest({
        body: { label: 'dono' },
        method: 'PATCH',
        path: `${EMAILS_PATH}/${EMAIL_ID}`,
      }),
    )
    expect(patched.status).toBe(200)
    expect(fixture.calls.updateLabel).toEqual([
      { actor: ACTOR, emailId: EMAIL_ID, label: 'dono', taxId: CLIENT_TAX_ID },
    ])

    const addressChange = await fixture.handle(
      jsonRequest({
        body: { address: 'outro@mercado.test' },
        method: 'PATCH',
        path: `${EMAILS_PATH}/${EMAIL_ID}`,
      }),
    )
    expect(addressChange.status).toBe(400)

    const removed = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: `${EMAILS_PATH}/${EMAIL_ID}` }),
    )
    expect(removed.status).toBe(204)
    expect(fixture.calls.remove).toEqual([
      { actor: ACTOR, emailId: EMAIL_ID, taxId: CLIENT_TAX_ID },
    ])
  })

  test('id de e-mail que não é UUID é recusado antes do caso de uso', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: `${EMAILS_PATH}/nao-e-uuid` }),
    )

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(fixture.calls.remove).toEqual([])
  })

  test('ler é fleet.read; escrever exige fleet.manage', async () => {
    const fixture = createFixture({ permissions: READ_ONLY_PERMISSIONS })

    expect((await fixture.handle(jsonRequest({ method: 'GET', path: EMAILS_PATH }))).status).toBe(
      200,
    )
    for (const request of [
      jsonRequest({
        body: { address: 'a@mercado.test', purpose: 'boleto' },
        method: 'POST',
        path: EMAILS_PATH,
      }),
      jsonRequest({ body: { label: 'x' }, method: 'PATCH', path: `${EMAILS_PATH}/${EMAIL_ID}` }),
      jsonRequest({ method: 'DELETE', path: `${EMAILS_PATH}/${EMAIL_ID}` }),
    ]) {
      expect((await fixture.handle(request)).status).toBe(403)
    }
    expect(fixture.calls.add).toEqual([])
    expect(fixture.calls.updateLabel).toEqual([])
    expect(fixture.calls.remove).toEqual([])
  })
})
