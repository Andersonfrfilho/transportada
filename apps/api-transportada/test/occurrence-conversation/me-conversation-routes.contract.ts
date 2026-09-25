/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11): as rotas do motorista para a conversa da ocorrência. Ler é `trip.read` e
 * responder é `trip.report`, as chaves das rotas `/me`; o motorista é o da ficha do vínculo do
 * contexto, e quem não tem ficha recebe a mesma recusa das outras rotas `/me`.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createMeOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/me-occurrence-conversation.routes.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000184101'
const DRIVER_ID = '00000000-0000-4000-8000-000000184102'
const PATH = `/me/trips/current/occurrences/${OCCURRENCE_ID}/messages`

function createFixture(params: {
  readonly driverId?: null | string
  readonly error?: Error
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: { input: unknown; name: string }[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'me-occurrence-conversation-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: {
      ...COMPANY_CONTEXT,
      permissions: params.permissions ?? new Set(['trip.read', 'trip.report'] as const),
    },
  }
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: { authenticate: async () => context.identity },
    authorization: { authorize: (value, policy) => authorization.authorize(value, policy) },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    routes: createMeOccurrenceConversationRoutes({
      inbox: {
        list: async (input) => {
          calls.push({ input, name: 'inbox' })
          return []
        },
      },
      markRead: {
        markRead: async (input) => {
          calls.push({ input, name: 'markRead' })
        },
      },
      list: {
        list: async (input) => {
          calls.push({ input, name: 'list' })
          if (params.error !== undefined) throw params.error
          return []
        },
      },
      reply: {
        reply: async (input) => {
          calls.push({ input, name: 'reply' })
          return { conversationId: 'conversation-1', messageId: 'message-1' }
        },
      },
      resolveDriverId: async () => (params.driverId === undefined ? DRIVER_ID : params.driverId),
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'me-conversation-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function replyRequest(body: unknown, key: null | string = 'driver-reply-key-0001') {
  const request = jsonRequest({ body, method: 'POST', path: PATH })
  if (key !== null) request.headers.set('idempotency-key', key)
  return request
}

describe('a conversa da ocorrência no /me do motorista (spec 183 T601)', () => {
  test('lê a conversa dele pelo trip.read, com a ficha e o usuário do contexto', async () => {
    const fixture = createFixture({ permissions: new Set(['trip.read'] as const) })
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(fixture.calls).toEqual([
      {
        input: {
          companyId: COMPANY_CONTEXT.companyId,
          driverId: DRIVER_ID,
          driverUserId: COMPANY_CONTEXT.userId,
          occurrenceId: OCCURRENCE_ID,
        },
        name: 'list',
      },
    ])
  })

  test('responde pelo trip.report, com a chave; sem ela ou com campo a mais é 400', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(replyRequest({ body: 'Aguardo sim.' }))
    expect(response.status).toBe(201)
    expect(fixture.calls[0]).toEqual({
      input: {
        bodyText: 'Aguardo sim.',
        companyId: COMPANY_CONTEXT.companyId,
        driverId: DRIVER_ID,
        driverUserId: COMPANY_CONTEXT.userId,
        idempotencyKey: 'driver-reply-key-0001',
        occurrenceId: OCCURRENCE_ID,
      },
      name: 'reply',
    })

    expect((await fixture.handle(replyRequest({ body: 'Oi' }, null))).status).toBe(400)
    expect((await fixture.handle(replyRequest({ body: 'Oi', channel: 'app' }))).status).toBe(400)
  })

  test('sem trip.report não responde; sem ficha de motorista, a recusa das rotas /me', async () => {
    const reader = createFixture({ permissions: new Set(['trip.read'] as const) })
    expect((await reader.handle(replyRequest({ body: 'Oi' }))).status).toBe(403)

    const notDriver = createFixture({ driverId: null })
    const response = await notDriver.handle(jsonRequest({ method: 'GET', path: PATH }))
    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('DRIVER_NOT_REGISTERED')
    expect(notDriver.calls).toEqual([])
  })

  test('ocorrência de viagem que não é dele é 404', async () => {
    const fixture = createFixture({ error: new TripOccurrenceNotFoundError() })
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_OCCURRENCE_NOT_FOUND')
  })
})

describe('as conversas do motorista e a leitura (spec 183 T604)', () => {
  test('lista as conversas dele pelo trip.read, do usuário do contexto', async () => {
    const fixture = createFixture({ permissions: new Set(['trip.read'] as const) })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/me/trips/current/occurrence-conversations' }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(fixture.calls).toEqual([
      {
        input: { companyId: COMPANY_CONTEXT.companyId, driverUserId: COMPANY_CONTEXT.userId },
        name: 'inbox',
      },
    ])
  })

  test('abrir a conversa marca lida pelo trip.read e responde 204', async () => {
    const fixture = createFixture({ permissions: new Set(['trip.read'] as const) })
    const response = await fixture.handle(jsonRequest({ method: 'POST', path: `${PATH}/read` }))
    expect(response.status).toBe(204)
    expect(fixture.calls).toEqual([
      {
        input: {
          companyId: COMPANY_CONTEXT.companyId,
          driverId: DRIVER_ID,
          driverUserId: COMPANY_CONTEXT.userId,
          occurrenceId: OCCURRENCE_ID,
        },
        name: 'markRead',
      },
    ])
  })

  test('sem ficha de motorista, a lista também recusa', async () => {
    const fixture = createFixture({ driverId: null })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/me/trips/current/occurrence-conversations' }),
    )
    expect(response.status).toBe(409)
    expect(fixture.calls).toEqual([])
  })
})
