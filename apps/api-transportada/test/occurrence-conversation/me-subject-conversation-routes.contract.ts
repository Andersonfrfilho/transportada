/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4: a tabela das rotas da conversa por assunto no `/me` — toda rota nova presente com a
 * política e o limite do contrato, as rotas antigas da 183 inalteradas, e o comportamento de cada uma
 * (validação, resposta `no-store`, recusas).
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
import { ConversationNotFoundError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { createMeOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/me-occurrence-conversation.routes.js'
import { createMeSubjectConversationRoutes } from '../../src/occurrence-conversation/presentation/me-subject-conversation.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const SUBJECT_ID = '00000000-0000-4000-8000-000000260101'
const DRIVER_ID = '00000000-0000-4000-8000-000000260102'
const MESSAGE_ID = '00000000-0000-4000-8000-000000260103'
const BASE = '/me/trips/current/conversations'
const SUMMARY = { protocol: '261009-K7M2', subjectType: 'document' }

const READ = { permission: 'trip.read', scope: 'company' }
const REPORT = { permission: 'trip.report', scope: 'company' }

function createFixture(params: {
  readonly driverId?: null | string
  readonly error?: Error
  readonly opened?: { readonly created: boolean }
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: { input: unknown; name: string }[] = []
  const fail = () => {
    if (params.error !== undefined) throw params.error
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'me-subject-conversation-contract',
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
    routes: createMeSubjectConversationRoutes({
      list: {
        list: async (input) => {
          calls.push({ input, name: 'list' })
          fail()
          return { data: [SUMMARY] as never, nextCursor: 'next-cursor' }
        },
      },
      markRead: {
        markRead: async (input) => {
          calls.push({ input, name: 'markRead' })
          fail()
        },
      },
      messages: {
        list: async (input) => {
          calls.push({ input, name: 'messages' })
          fail()
          return []
        },
      },
      open: {
        open: async (input) => {
          calls.push({ input, name: 'open' })
          fail()
          return { created: params.opened?.created ?? true, summary: SUMMARY as never }
        },
      },
      resolveDriverId: async () => (params.driverId === undefined ? DRIVER_ID : params.driverId),
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'me-subject-conversation-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

const unused = new Proxy({}, { get: () => () => undefined })
const tableOf = (
  routes: readonly { method: string; pathname: string; policy?: unknown; rateLimit?: unknown }[],
) =>
  routes.map((route) => ({
    method: route.method,
    pathname: route.pathname,
    policy: route.policy,
    rateLimit: route.rateLimit,
  }))

describe('a tabela de rotas da conversa por assunto (spec 263 T2.4)', () => {
  test('toda rota nova está presente, com a política e o limite do contrato', () => {
    const routes = createMeSubjectConversationRoutes(unused as never)
    expect(tableOf(routes)).toEqual([
      { method: 'GET', pathname: BASE, policy: READ, rateLimit: undefined },
      {
        method: 'POST',
        pathname: `${BASE}/open`,
        policy: REPORT,
        rateLimit: {
          maxRequests: 20,
          scope: 'driver-conversation-open',
          store: 'postgres',
          windowSeconds: 300,
        },
      },
      {
        method: 'GET',
        pathname: `${BASE}/:subjectType/:subjectId/messages`,
        policy: READ,
        rateLimit: undefined,
      },
      {
        method: 'POST',
        pathname: `${BASE}/:subjectType/:subjectId/messages/read`,
        policy: READ,
        rateLimit: undefined,
      },
    ])
  })

  test('as rotas antigas da 183 seguem exatamente como eram', () => {
    const routes = createMeOccurrenceConversationRoutes(unused as never)
    expect(tableOf(routes).map((route) => `${route.method} ${route.pathname}`)).toEqual([
      'GET /me/trips/current/occurrence-conversations',
      'POST /me/trips/current/occurrences/:id/messages/read',
      'GET /me/trips/current/occurrences/:id/messages',
      'POST /me/trips/current/occurrences/:id/uploads',
      'POST /me/trips/current/occurrences/:id/messages',
    ])
    expect(routes.filter((route) => route.rateLimit !== undefined).map((r) => r.rateLimit)).toEqual(
      [
        {
          maxRequests: 60,
          scope: 'driver-occurrence-conversation-upload',
          store: 'postgres',
          windowSeconds: 300,
        },
        {
          maxRequests: 30,
          scope: 'driver-occurrence-conversation-send',
          store: 'postgres',
          windowSeconds: 300,
        },
      ],
    )
  })
})

describe('a lista e abrir (spec 263 T2.4)', () => {
  test('lista pelo trip.read, com a ficha e o usuário do contexto, cursor e envelope de paginação', async () => {
    const fixture = createFixture({ permissions: new Set(['trip.read'] as const) })
    const cursor = `2026-10-09T14:00:00.000Z::${SUBJECT_ID}`
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${BASE}?cursor=${encodeURIComponent(cursor)}` }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toEqual({
      data: [SUMMARY],
      pagination: { nextCursor: 'next-cursor' },
    })
    expect(fixture.calls).toEqual([
      {
        input: {
          companyId: COMPANY_CONTEXT.companyId,
          cursor,
          driverId: DRIVER_ID,
          driverUserId: COMPANY_CONTEXT.userId,
        },
        name: 'list',
      },
    ])
  })

  test('cursor fora do formato, parâmetro desconhecido e repetido são 400', async () => {
    const fixture = createFixture({})
    for (const query of ['?cursor=qualquer', '?outro=1', `?cursor=a&cursor=b`]) {
      expect(
        (await fixture.handle(jsonRequest({ method: 'GET', path: `${BASE}${query}` }))).status,
      ).toBe(400)
    }
    expect(fixture.calls).toEqual([])
  })

  const open = (fixture: ReturnType<typeof createFixture>, body: unknown) =>
    fixture.handle(jsonRequest({ body, method: 'POST', path: `${BASE}/open` }))

  test('abrir: 201 na primeira, 200 na repetição, pelo trip.report', async () => {
    const created = await open(createFixture({}), {
      subjectId: SUBJECT_ID,
      subjectType: 'document',
    })
    expect(created.status).toBe(201)
    expect(created.headers.get('cache-control')).toContain('no-store')
    expect(await created.json()).toEqual({ data: SUMMARY })
    const again = await open(createFixture({ opened: { created: false } }), {
      subjectId: SUBJECT_ID,
      subjectType: 'trip',
    })
    expect(again.status).toBe(200)
  })

  test('abrir recusa ocorrência, campo a mais, id que não é UUID e sem trip.report', async () => {
    const fixture = createFixture({})
    for (const body of [
      { subjectId: SUBJECT_ID, subjectType: 'occurrence' },
      { subjectId: SUBJECT_ID, subjectType: 'document', channel: 'app' },
      { subjectId: 'nao-e-uuid', subjectType: 'document' },
      { subjectType: 'document' },
    ]) {
      expect((await open(fixture, body)).status).toBe(400)
    }
    expect(fixture.calls).toEqual([])
    const reader = createFixture({ permissions: new Set(['trip.read'] as const) })
    expect((await open(reader, { subjectId: SUBJECT_ID, subjectType: 'document' })).status).toBe(
      403,
    )
  })
})

describe('as mensagens e a leitura (spec 263 T2.4)', () => {
  const messagesPath = (subjectType: string, subjectId = SUBJECT_ID) =>
    `${BASE}/${subjectType}/${subjectId}/messages`

  test('lê as mensagens com before e limit; os três assuntos entram', async () => {
    for (const subjectType of ['occurrence', 'document', 'trip']) {
      const fixture = createFixture({ permissions: new Set(['trip.read'] as const) })
      const response = await fixture.handle(
        jsonRequest({
          method: 'GET',
          path: `${messagesPath(subjectType)}?before=${MESSAGE_ID}&limit=20`,
        }),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(fixture.calls).toEqual([
        {
          input: {
            before: MESSAGE_ID,
            companyId: COMPANY_CONTEXT.companyId,
            driverId: DRIVER_ID,
            driverUserId: COMPANY_CONTEXT.userId,
            limit: 20,
            subjectId: SUBJECT_ID,
            subjectType,
          },
          name: 'messages',
        },
      ])
    }
  })

  test('sem before e limit eles não vão; fora do vocabulário, do UUID ou do teto é 400', async () => {
    const fixture = createFixture({})
    await fixture.handle(jsonRequest({ method: 'GET', path: messagesPath('trip') }))
    expect(fixture.calls[0]?.input).not.toHaveProperty('before')
    expect(fixture.calls[0]?.input).not.toHaveProperty('limit')
    const before = fixture.calls.length
    for (const path of [
      messagesPath('webchat'),
      messagesPath('trip', 'nao-e-uuid'),
      `${messagesPath('trip')}?limit=101`,
      `${messagesPath('trip')}?limit=0`,
      `${messagesPath('trip')}?limit=abc`,
      `${messagesPath('trip')}?before=nao-e-uuid`,
      `${messagesPath('trip')}?cursor=x`,
    ]) {
      expect((await fixture.handle(jsonRequest({ method: 'GET', path }))).status).toBe(400)
    }
    expect(fixture.calls.length).toBe(before)
  })

  test('marcar lida é 204 pelo trip.read', async () => {
    const fixture = createFixture({ permissions: new Set(['trip.read'] as const) })
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${messagesPath('document')}/read` }),
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(fixture.calls[0]).toMatchObject({
      input: { subjectId: SUBJECT_ID, subjectType: 'document' },
      name: 'markRead',
    })
  })

  test('assunto não alcançável é 404 CONVERSATION_NOT_FOUND', async () => {
    const fixture = createFixture({ error: new ConversationNotFoundError() })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: messagesPath('trip') }),
    )
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('CONVERSATION_NOT_FOUND')
  })

  test('sem ficha de motorista, a recusa das rotas /me; nada chega ao caso de uso', async () => {
    const fixture = createFixture({ driverId: null })
    for (const request of [
      jsonRequest({ method: 'GET', path: BASE }),
      jsonRequest({ method: 'GET', path: messagesPath('trip') }),
      jsonRequest({ method: 'POST', path: `${messagesPath('trip')}/read` }),
      jsonRequest({
        body: { subjectId: SUBJECT_ID, subjectType: 'trip' },
        method: 'POST',
        path: `${BASE}/open`,
      }),
    ]) {
      const response = await fixture.handle(request)
      expect(response.status).toBe(409)
      expect((await responseApiError(response)).code).toBe('DRIVER_NOT_REGISTERED')
    }
    expect(fixture.calls).toEqual([])
  })
})
