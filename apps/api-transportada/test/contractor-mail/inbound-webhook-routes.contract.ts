/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createPublicInboundEmailRoutes } from '../../src/contractor-mail/presentation/public-inbound-email.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import type { ProcessInboundEmailWebhookUseCase } from '../../src/contractor-mail/application/process-inbound-email-webhook.use-case.js'

const WEBHOOK_PATH = '/public/inbound-emails/00000000-0000-4000-8000-0000000000e1'

type LogCall = { readonly message: string; readonly metadata: unknown }

function buildHandler(outcome: 'accepted' | 'ignored' | 'unauthorized'): {
  readonly calls: unknown[]
  readonly handle: (request: Request) => Promise<Response>
  readonly logCalls: LogCall[]
} {
  const calls: unknown[] = []
  const logCalls: LogCall[] = []
  const processInboundEmailWebhook: ProcessInboundEmailWebhookUseCase = {
    async execute(input) {
      calls.push(input)
      return { outcome }
    },
  }

  const router = createRouter({
    anonymousRoutes: createPublicInboundEmailRoutes({ processInboundEmailWebhook }),
    authentication: {
      async authenticate() {
        throw new Error('should never authenticate an anonymous route')
      },
    },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes: [],
    tenantContext: {
      async resolveCompany() {
        throw new Error('should never resolve a tenant for an anonymous route')
      },
    },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'inbound-webhook-correlation',
    frontendOrigins: ['http://localhost:53000'],
    logger: {
      error: (message: string, metadata?: unknown) => logCalls.push({ message, metadata }),
      info: (message: string, metadata?: unknown) => logCalls.push({ message, metadata }),
      warn: (message: string, metadata?: unknown) => logCalls.push({ message, metadata }),
    },
    requestTimeoutSeconds: 10,
    router,
  })

  return { calls, handle: (request) => handleRequest(request, { timeout() {} }), logCalls }
}

function webhookRequest(input: {
  readonly body: string
  readonly headers?: Record<string, string>
}): Request {
  return new Request(`http://localhost${WEBHOOK_PATH}`, {
    body: input.body,
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_route_contract',
      'svix-signature': 'v1,does-not-matter-the-fake-use-case-decides',
      'svix-timestamp': '1757764800',
      ...input.headers,
    },
    method: 'POST',
  })
}

describe('POST /public/inbound-emails/:webhookId (spec 143, T010)', () => {
  test('responds 204 when the use case accepts the event', async () => {
    const { calls, handle } = buildHandler('accepted')
    const response = await handle(webhookRequest({ body: '{"type":"email.received"}' }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(calls).toEqual([
      {
        correlationId: 'inbound-webhook-correlation',
        rawBody: '{"type":"email.received"}',
        svixId: 'msg_route_contract',
        svixSignature: 'v1,does-not-matter-the-fake-use-case-decides',
        svixTimestamp: '1757764800',
        webhookId: '00000000-0000-4000-8000-0000000000e1',
      },
    ])
  })

  test('responds 204 when the use case ignores the event (unknown type, or repeated)', async () => {
    const { handle } = buildHandler('ignored')
    const response = await handle(webhookRequest({ body: '{"type":"email.bounced"}' }))

    expect(response.status).toBe(204)
  })

  test('responds 401 when the use case reports the signature as unauthorized', async () => {
    const { handle } = buildHandler('unauthorized')
    const response = await handle(webhookRequest({ body: '{"type":"email.received"}' }))

    expect(response.status).toBe(401)
    const body = (await response.json()) as { readonly error: { readonly code: string } }
    expect(body.error.code).toBe('CONTRACTOR_MAIL_INBOUND_WEBHOOK_UNAUTHORIZED')
  })

  test('never touches the anonymous route authentication or tenant resolution', async () => {
    const { handle } = buildHandler('accepted')
    const response = await handle(webhookRequest({ body: '{"type":"email.received"}' }))
    expect(response.status).toBe(204)
  })

  /** Revisão do `architect`: a rota ganhou teto — 120 por 5 minutos, por IP. */
  test('responds 429 once the rate limit is exceeded', async () => {
    const { handle } = buildHandler('accepted')
    const headers = { 'x-forwarded-for': '203.0.113.10' }

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await handle(webhookRequest({ body: '{"type":"email.received"}', headers }))
      expect(response.status).toBe(204)
    }

    const throttled = await handle(webhookRequest({ body: '{"type":"email.received"}', headers }))
    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('retry-after')).not.toBeNull()
  })

  /**
   * Revisão do `architect` (opcional): nenhum log leva o `webhookId`, os cabeçalhos `svix-*` ou o
   * corpo — nem no caminho de sucesso, nem no de 401.
   */
  test('never logs the webhookId, the svix headers or the body', async () => {
    const { handle, logCalls } = buildHandler('unauthorized')

    await handle(
      webhookRequest({
        body: '{"type":"email.received","data":{"email_id":"segredo-do-corpo"}}',
      }),
    )

    const serialized = JSON.stringify(logCalls)
    expect(serialized).not.toContain('00000000-0000-4000-8000-0000000000e1')
    expect(serialized).not.toContain('msg_route_contract')
    expect(serialized).not.toContain('does-not-matter-the-fake-use-case-decides')
    expect(serialized).not.toContain('segredo-do-corpo')
  })
})
