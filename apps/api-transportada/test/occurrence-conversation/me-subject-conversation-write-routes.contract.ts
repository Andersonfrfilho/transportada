/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4: as rotas de escrita da conversa por assunto no `/me` — a tabela (política e limites
 * idênticos aos das rotas antigas, o mesmo balde), a `Idempotency-Key` obrigatória, o `201` da primeira vez
 * e o `200` da repetição com o objeto completo, a validação e o mapa de erros.
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
import {
  ConversationClosedError,
  ConversationNotFoundError,
  OccurrenceConversationDriverChangedError,
  OccurrenceConversationIdempotencyKeyReusedError,
} from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import {
  createMeOccurrenceConversationRoutes,
  DRIVER_CONVERSATION_SEND_RATE_LIMIT,
  DRIVER_CONVERSATION_UPLOAD_RATE_LIMIT,
} from '../../src/occurrence-conversation/presentation/me-occurrence-conversation.routes.js'
import { createMeSubjectConversationWriteRoutes } from '../../src/occurrence-conversation/presentation/me-subject-conversation-write.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import { FRONTEND_ORIGIN, responseApiError } from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const SUBJECT_ID = '00000000-0000-4000-8000-000000260301'
const DRIVER_ID = '00000000-0000-4000-8000-000000260302'
const ATTACHMENT_ID = '00000000-0000-4000-8000-000000260303'
const KEY = 'offline-queue-key-0001'
const BASE = '/me/trips/current/conversations'
const REPORT = { permission: 'trip.report', scope: 'company' }
const MESSAGE = { bodyText: 'Cheguei', clientMessageId: KEY, id: 'message-1' }
const UPLOAD = {
  expiresAt: '2026-10-09T15:15:00.000Z',
  uploadId: 'upload-1',
  uploadUrl: 'https://u',
}

type Call = { input: unknown; name: string }

function createFixture(params: {
  readonly driverId?: null | string
  readonly error?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly replayed?: boolean
}) {
  const calls: Call[] = []
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
      subject: 'me-subject-conversation-write-contract',
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
    routes: createMeSubjectConversationWriteRoutes({
      reply: {
        reply: async (input) => {
          calls.push({ input, name: 'reply' })
          fail()
          return { message: MESSAGE as never, replayed: params.replayed ?? false }
        },
      },
      requestUpload: {
        request: async (input) => {
          calls.push({ input, name: 'requestUpload' })
          fail()
          return UPLOAD
        },
      },
      resolveDriverId: async () => (params.driverId === undefined ? DRIVER_ID : params.driverId),
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'me-subject-conversation-write-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${FRONTEND_ORIGIN}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: FRONTEND_ORIGIN,
      'x-correlation-id': 'me-subject-conversation-write-correlation',
      ...headers,
    },
    method: 'POST',
  })
}

const messagesPath = (subjectType: string, subjectId = SUBJECT_ID) =>
  `${BASE}/${subjectType}/${subjectId}/messages`
const uploadsPath = (subjectType: string, subjectId = SUBJECT_ID) =>
  `${BASE}/${subjectType}/${subjectId}/uploads`
const send = (fixture: ReturnType<typeof createFixture>, body: unknown, key: null | string = KEY) =>
  fixture.handle(
    post(messagesPath('document'), body, key === null ? {} : { 'idempotency-key': key }),
  )
const unused = new Proxy({}, { get: () => () => undefined })

describe('a tabela das rotas de escrita por assunto (spec 260 T2.4)', () => {
  test('duas rotas com trip.report e os MESMOS limites das rotas antigas (o balde é compartilhado)', () => {
    const routes = createMeSubjectConversationWriteRoutes(unused as never)
    const table: readonly { method: string; pathname: string; policy?: unknown }[] = routes
    expect(table.map(({ method, pathname, policy }) => ({ method, pathname, policy }))).toEqual([
      { method: 'POST', pathname: `${BASE}/:subjectType/:subjectId/messages`, policy: REPORT },
      { method: 'POST', pathname: `${BASE}/:subjectType/:subjectId/uploads`, policy: REPORT },
    ])
    expect(routes[0]?.rateLimit).toBe(DRIVER_CONVERSATION_SEND_RATE_LIMIT)
    expect(routes[1]?.rateLimit).toBe(DRIVER_CONVERSATION_UPLOAD_RATE_LIMIT)

    const old = createMeOccurrenceConversationRoutes(unused as never)
    const oldLimits = old.flatMap((route) =>
      route.rateLimit === undefined ? [] : [route.rateLimit],
    )
    expect(oldLimits).toEqual([
      DRIVER_CONVERSATION_UPLOAD_RATE_LIMIT,
      DRIVER_CONVERSATION_SEND_RATE_LIMIT,
    ])
    expect(DRIVER_CONVERSATION_SEND_RATE_LIMIT).toEqual({
      maxRequests: 30,
      scope: 'driver-occurrence-conversation-send',
      store: 'postgres',
      windowSeconds: 300,
    })
  })
})

describe('responder por assunto (spec 260 T2.4)', () => {
  test('201 na primeira vez e 200 na repetição, os dois com { data: Message } e no-store', async () => {
    const first = await send(createFixture({}), { body: 'Cheguei' })
    expect(first.status).toBe(201)
    expect(first.headers.get('cache-control')).toContain('no-store')
    expect(await first.json()).toEqual({ data: MESSAGE })

    const again = await send(createFixture({ replayed: true }), { body: 'Cheguei' })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ data: MESSAGE })
  })

  test('o caso de uso recebe o assunto do caminho, a chave, o corpo e a ficha e o usuário do contexto', async () => {
    for (const subjectType of ['occurrence', 'document', 'trip']) {
      const fixture = createFixture({})
      const response = await fixture.handle(
        post(
          messagesPath(subjectType),
          { attachmentIds: [ATTACHMENT_ID], body: 'Cheguei' },
          { 'idempotency-key': KEY },
        ),
      )
      expect(response.status).toBe(201)
      expect(fixture.calls).toEqual([
        {
          input: {
            attachmentIds: [ATTACHMENT_ID],
            bodyText: 'Cheguei',
            companyId: COMPANY_CONTEXT.companyId,
            driverId: DRIVER_ID,
            driverUserId: COMPANY_CONTEXT.userId,
            idempotencyKey: KEY,
            subjectId: SUBJECT_ID,
            subjectType,
          },
          name: 'reply',
        },
      ])
    }
  })

  test('sem anexos no corpo, attachmentIds vai vazio', async () => {
    const fixture = createFixture({})
    await send(fixture, { body: 'Cheguei' })
    expect(fixture.calls[0]?.input).toMatchObject({ attachmentIds: [] })
  })

  test('chave ausente, curta, longa ou com caractere fora do padrão é 400', async () => {
    const fixture = createFixture({})
    for (const key of [
      null,
      'curta',
      'k'.repeat(257),
      'chave com espaço 0001',
      'chave/barra/00001',
    ]) {
      expect((await send(fixture, { body: 'Cheguei' }, key)).status).toBe(400)
    }
    expect(fixture.calls).toEqual([])
  })

  test('corpo inválido, campo a mais, anexo que não é UUID e mais de cinco anexos são 400', async () => {
    const fixture = createFixture({})
    for (const body of [
      {},
      { body: 1 },
      { body: 'x'.repeat(8001) },
      { body: 'ok', channel: 'whatsapp' },
      { attachmentIds: ['nao-e-uuid'], body: 'ok' },
      { attachmentIds: Array.from({ length: 6 }, () => ATTACHMENT_ID), body: 'ok' },
    ]) {
      expect((await send(fixture, body)).status).toBe(400)
    }
    for (const path of [messagesPath('webchat'), messagesPath('trip', 'nao-e-uuid')]) {
      const response = await fixture.handle(post(path, { body: 'ok' }, { 'idempotency-key': KEY }))
      expect(response.status).toBe(400)
    }
    expect(fixture.calls).toEqual([])
  })

  test('sem trip.report é 403 e sem ficha de motorista é a recusa das rotas /me', async () => {
    const reader = createFixture({ permissions: new Set(['trip.read'] as const) })
    expect((await send(reader, { body: 'ok' })).status).toBe(403)
    const unregistered = createFixture({ driverId: null })
    const response = await send(unregistered, { body: 'ok' })
    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('DRIVER_NOT_REGISTERED')
    expect([...reader.calls, ...unregistered.calls]).toEqual([])
  })

  test('os erros do caso de uso saem com o código e o status do contrato', async () => {
    const cases = [
      { code: 'CONVERSATION_NOT_FOUND', error: new ConversationNotFoundError(), status: 404 },
      { code: 'CONVERSATION_CLOSED', error: new ConversationClosedError(), status: 409 },
      {
        code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED',
        error: new OccurrenceConversationDriverChangedError(),
        status: 409,
      },
      {
        code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED',
        error: new OccurrenceConversationIdempotencyKeyReusedError(),
        status: 409,
      },
    ]
    for (const item of cases) {
      const response = await send(createFixture({ error: item.error }), { body: 'ok' })
      expect(response.status).toBe(item.status)
      expect((await responseApiError(response)).code).toBe(item.code)
    }
  })
})

describe('pedir a subida do anexo por assunto (spec 260 T2.4)', () => {
  const body = { contentType: 'image/jpeg', fileName: 'foto.jpg', sizeBytes: 1000 }

  test('201 com { data } da forma de hoje, para os três assuntos', async () => {
    for (const subjectType of ['occurrence', 'document', 'trip']) {
      const fixture = createFixture({})
      const response = await fixture.handle(post(uploadsPath(subjectType), body))
      expect(response.status).toBe(201)
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(await response.json()).toEqual({ data: UPLOAD })
      expect(fixture.calls).toEqual([
        {
          input: {
            ...body,
            companyId: COMPANY_CONTEXT.companyId,
            driverId: DRIVER_ID,
            driverUserId: COMPANY_CONTEXT.userId,
            subjectId: SUBJECT_ID,
            subjectType,
          },
          name: 'requestUpload',
        },
      ])
    }
  })

  test('corpo inválido, campo a mais, assunto fora do vocabulário e sem trip.report são recusados', async () => {
    const fixture = createFixture({})
    for (const invalid of [{}, { ...body, sizeBytes: 0 }, { ...body, participant: 'driver' }]) {
      expect((await fixture.handle(post(uploadsPath('trip'), invalid))).status).toBe(400)
    }
    expect((await fixture.handle(post(uploadsPath('webchat'), body))).status).toBe(400)
    expect(fixture.calls).toEqual([])
    const reader = createFixture({ permissions: new Set(['trip.read'] as const) })
    expect((await reader.handle(post(uploadsPath('trip'), body))).status).toBe(403)
  })

  test('conversa encerrada é 409 e assunto alheio é 404', async () => {
    const closed = await createFixture({ error: new ConversationClosedError() }).handle(
      post(uploadsPath('document'), body),
    )
    expect(closed.status).toBe(409)
    expect((await responseApiError(closed)).code).toBe('CONVERSATION_CLOSED')
    const foreign = await createFixture({ error: new ConversationNotFoundError() }).handle(
      post(uploadsPath('document'), body),
    )
    expect(foreign.status).toBe(404)
    expect((await responseApiError(foreign)).code).toBe('CONVERSATION_NOT_FOUND')
  })
})
