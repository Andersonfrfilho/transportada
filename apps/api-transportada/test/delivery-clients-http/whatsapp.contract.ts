/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b: as rotas dos números de WhatsApp do cliente de entrega — forma do corpo, só a forma mascarada na
 * resposta, ator e IP vindos do contexto, e a permissão (ler `fleet.read`, escrever `fleet.manage`).
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { DeliveryClientWhatsApp } from '../../src/delivery-clients/application/delivery-client-whatsapp.port.js'
import type { DeliveryClientWhatsAppUseCase } from '../../src/delivery-clients/application/delivery-client-whatsapp.use-case.js'
import { DeliveryClientWhatsAppLimitReachedError } from '../../src/delivery-clients/domain/delivery-client.error.js'
import { createDeliveryClientWhatsAppRoutes } from '../../src/delivery-clients/presentation/delivery-client-whatsapp.routes.js'
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

const NUMBER_ID = '00000000-0000-4000-8000-000000000821'
const PATH = `/delivery-clients/${CLIENT_TAX_ID}/whatsapp`
const ITEM: DeliveryClientWhatsApp = {
  createdAt: new Date('2026-10-27T20:00:00.000Z'),
  createdByKind: 'office',
  id: NUMBER_ID,
  label: 'balcão',
  numberMasked: '+55 ••••1111',
}
const ACTOR = {
  companyId: COMPANY_CONTEXT.companyId,
  correlationId: CORRELATION_ID,
  ipAddress: '203.0.113.9',
  userId: COMPANY_CONTEXT.userId,
}

function createFixture(
  params: { readonly error?: Error; readonly permissions?: CompanyContext['permissions'] } = {},
) {
  const calls: Record<string, unknown[]> = { add: [], list: [], remove: [], update: [] }
  const record =
    <TResult>(name: string, result: TResult) =>
    (input: object) => {
      calls[name]?.push(structuredClone(input))
      if (params.error !== undefined) return Promise.reject(params.error)
      return Promise.resolve(result)
    }
  const numbers: DeliveryClientWhatsAppUseCase = {
    add: record('add', ITEM),
    list: record('list', [ITEM]),
    remove: record('remove', undefined),
    update: record('update', ITEM),
  }
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
      routes: createDeliveryClientWhatsAppRoutes({ numbers, resolveClientIp: () => '203.0.113.9' }),
    }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('as rotas dos números de WhatsApp do cliente de entrega (spec 281 T8b)', () => {
  test('lista só a forma mascarada', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))
    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual([
      {
        createdAt: '2026-10-27T20:00:00.000Z',
        createdByKind: 'office',
        id: NUMBER_ID,
        label: 'balcão',
        numberMasked: '+55 ••••1111',
      },
    ])
    expect(fixture.calls.list).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, taxId: CLIENT_TAX_ID },
    ])
  })

  test('cadastra com o ator, o número e o rótulo aparado; responde 201 sem o número em claro', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({
        body: { label: ' balcão ', number: ' (16) 99999-1111 ' },
        method: 'POST',
        path: PATH,
      }),
    )
    expect(response.status).toBe(201)
    expect(JSON.stringify(await response.json())).not.toContain('99999')
    expect(fixture.calls.add).toEqual([
      { actor: ACTOR, label: 'balcão', number: '(16) 99999-1111', taxId: CLIENT_TAX_ID },
    ])
  })

  test('recusa corpo sem número, campo desconhecido e rótulo acima de 60', async () => {
    const fixture = createFixture()
    const post = (body: object) => fixture.handle(jsonRequest({ body, method: 'POST', path: PATH }))
    expect((await post({ label: 'x' })).status).toBe(400)
    expect((await post({ extra: 1, number: '16999991111' })).status).toBe(400)
    expect((await post({ label: 'x'.repeat(61), number: '16999991111' })).status).toBe(400)
    expect(fixture.calls.add).toEqual([])
  })

  test('edita rótulo e/ou número; PATCH vazio é 400', async () => {
    const fixture = createFixture()
    const patch = (body: object) =>
      fixture.handle(jsonRequest({ body, method: 'PATCH', path: `${PATH}/${NUMBER_ID}` }))
    expect((await patch({ label: 'recebimento' })).status).toBe(200)
    expect((await patch({ number: '16 98888 2222' })).status).toBe(200)
    expect((await patch({})).status).toBe(400)
    expect(fixture.calls.update).toEqual([
      { actor: ACTOR, label: 'recebimento', numberId: NUMBER_ID, taxId: CLIENT_TAX_ID },
      { actor: ACTOR, number: '16 98888 2222', numberId: NUMBER_ID, taxId: CLIENT_TAX_ID },
    ])
  })

  test('remove com 204', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: `${PATH}/${NUMBER_ID}` }),
    )
    expect(response.status).toBe(204)
    expect(fixture.calls.remove).toEqual([
      { actor: ACTOR, numberId: NUMBER_ID, taxId: CLIENT_TAX_ID },
    ])
  })

  test('o limite volta como 422 com código estável', async () => {
    const fixture = createFixture({ error: new DeliveryClientWhatsAppLimitReachedError(10) })
    const response = await fixture.handle(
      jsonRequest({ body: { number: '16999991111' }, method: 'POST', path: PATH }),
    )
    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('DELIVERY_CLIENT_WHATSAPP_LIMIT_REACHED')
  })

  test('só leitura (`fleet.read`) lista, mas não escreve', async () => {
    const fixture = createFixture({ permissions: READ_ONLY_PERMISSIONS })
    expect((await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))).status).toBe(200)
    const post = await fixture.handle(
      jsonRequest({ body: { number: '16999991111' }, method: 'POST', path: PATH }),
    )
    expect(post.status).toBe(403)
    expect(
      (await fixture.handle(jsonRequest({ method: 'DELETE', path: `${PATH}/${NUMBER_ID}` })))
        .status,
    ).toBe(403)
    expect(fixture.calls.add).toEqual([])
  })
})
