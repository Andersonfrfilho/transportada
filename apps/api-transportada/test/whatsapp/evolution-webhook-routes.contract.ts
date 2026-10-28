/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6 (RF4): a entrega anônima do Evolution e a rota do dono que aponta o webhook.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { WhatsAppEvolutionWebhookUseCase } from '../../src/whatsapp/application/whatsapp-evolution-webhook.use-case.js'
import {
  createWhatsAppEvolutionPublicWebhookRoutes,
  createWhatsAppEvolutionWebhookRoutes,
} from '../../src/whatsapp/presentation/whatsapp-evolution-webhook.routes.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const WEBHOOK_ID = '00000000-0000-4000-8000-0000000000aa'
const BODY = JSON.stringify({ data: {}, event: 'messages.upsert', instance: 'transportada' })

function publicRoute(outcome: 'accepted' | 'ignored' | 'unauthorized') {
  const received: Parameters<WhatsAppEvolutionWebhookUseCase['receive']>[0][] = []
  const [route] = createWhatsAppEvolutionPublicWebhookRoutes({
    webhook: {
      async receive(input) {
        received.push(input)
        return { outcome }
      },
    },
  })
  if (route === undefined) throw new Error('route not registered')

  const post = (headers: Record<string, string>) =>
    route.execute({
      correlationId: 'corr-1',
      pathParameters: { webhookId: WEBHOOK_ID },
      request: new Request(`https://api.local/public/whatsapp-evolution/${WEBHOOK_ID}`, {
        body: BODY,
        headers,
        method: 'POST',
      }),
    })
  return { post, received, route }
}

describe('a entrega do Evolution (spec 281 T6)', () => {
  test('é anônima, opaca no id e lê o segredo do cabeçalho com o corpo cru', async () => {
    const { post, received, route } = publicRoute('accepted')

    const response = await post({ 'x-transportada-webhook-token': 'segredo' })

    expect(route.method).toBe('POST')
    expect(route.pathname).toBe('/public/whatsapp-evolution/:webhookId')
    expect(route.pathParameterFormat).toBe('opaque')
    expect(response.status).toBe(200)
    expect(received).toEqual([
      { correlationId: 'corr-1', rawBody: BODY, token: 'segredo', webhookId: WEBHOOK_ID },
    ])
  })

  test('sem cabeçalho o segredo chega nulo, e a recusa é 401 sem corpo', async () => {
    const { post, received } = publicRoute('unauthorized')

    const response = await post({})

    expect(received[0]?.token).toBeNull()
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('')
  })

  test('evento ignorado também é 200: erro faria o Evolution repetir', async () => {
    expect(
      (await publicRoute('ignored').post({ 'x-transportada-webhook-token': 's' })).status,
    ).toBe(200)
  })
})

function ownerFixture(permissions: CompanyContext['permissions']) {
  const calls: unknown[] = []
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(permissions),
      routes: createWhatsAppEvolutionWebhookRoutes({
        webhook: {
          async register(input) {
            calls.push(structuredClone(input))
            return { registeredAt: '2026-10-27T19:00:00.000Z' }
          },
        },
      }),
    }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('apontar o webhook (spec 281 T6)', () => {
  const PATH = '/company-settings/whatsapp-evolution/webhook'

  test('é settings.manage, sem cache, e devolve só quando ficou registrado', async () => {
    const fixture = ownerFixture(new Set(['settings.manage'] as const))

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: PATH }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: { registeredAt: '2026-10-27T19:00:00.000Z' } })
    expect(fixture.calls).toHaveLength(1)
  })

  test('sem settings.manage é 403 e nada é apontado', async () => {
    const fixture = ownerFixture(new Set(['invoices.read'] as const))

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: PATH }))

    expect(response.status).toBe(403)
    expect(fixture.calls).toEqual([])
  })
})
