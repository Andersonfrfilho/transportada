/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b: as rotas do escritório por assunto — a TABELA (política e limite de cada rota nova; as
 * antigas do escritório inalteradas), os verbos e códigos de cada rota, a `Idempotency-Key` do envio, os
 * erros de domínio e o recorte por permissão (`fleet.read` lê, `trip.manage` escreve).
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import {
  ConversationClosedError,
  ConversationNoDriverError,
  ConversationNotFoundError,
} from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import {
  createOccurrenceConversationRoutes,
  OCCURRENCE_CONVERSATION_RATE_LIMIT,
  OCCURRENCE_CONVERSATION_UPLOAD_RATE_LIMIT,
} from '../../src/occurrence-conversation/presentation/occurrence-conversation.routes.js'
import { createOfficeSubjectConversationRoutes } from '../../src/occurrence-conversation/presentation/office-subject-conversation.routes.js'
import {
  createOfficeSubjectConversationWriteRoutes,
  OFFICE_SUBJECT_CONVERSATION_STATE_RATE_LIMIT,
} from '../../src/occurrence-conversation/presentation/office-subject-conversation-write.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import { FRONTEND_ORIGIN, responseApiError } from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const TRIP_ID = '00000000-0000-4000-8000-000000260501'
const SUBJECT_ID = '00000000-0000-4000-8000-000000260502'
const ATTACHMENT_ID = '00000000-0000-4000-8000-000000260503'
const KEY = 'office-send-key-0001'
const BASE = `/trips/${TRIP_ID}/conversations`
const READ = { permission: 'fleet.read', scope: 'company' } as const
const WRITE = { permission: 'trip.manage', scope: 'company' } as const
const RESOLVE = { permission: 'occurrences.resolve', scope: 'company' } as const
const SUMMARY = { protocol: '261009-K7M2', status: 'open', subjectType: 'document' }
const MESSAGE = { bodyText: 'Pode subir?', clientMessageId: KEY, id: 'message-1' }
const UPLOAD = {
  expiresAt: '2026-10-09T15:15:00.000Z',
  uploadId: 'upload-1',
  uploadUrl: 'https://u',
}

type Call = { input: unknown; name: string }

function createFixture(
  params: {
    readonly created?: boolean
    readonly error?: Error
    readonly permissions?: CompanyContext['permissions']
    readonly replayed?: boolean
  } = {},
) {
  const calls: Call[] = []
  const run = async <T>(name: string, input: unknown, result: T): Promise<T> => {
    calls.push({ input, name })
    if (params.error !== undefined) throw params.error
    return result
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'office-subject-conversation-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: {
      ...COMPANY_CONTEXT,
      permissions: params.permissions ?? new Set(['fleet.read', 'trip.manage'] as const),
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
    routes: [
      ...createOfficeSubjectConversationRoutes({
        list: { list: (input) => run('list', input, [SUMMARY] as never) },
        markRead: { markRead: (input) => run('markRead', input, undefined) },
        messages: { list: (input) => run('messages', input, [MESSAGE] as never) },
      }),
      ...createOfficeSubjectConversationWriteRoutes({
        close: { close: (input) => run('close', input, SUMMARY as never) },
        open: {
          open: (input) =>
            run('open', input, { created: params.created ?? true, summary: SUMMARY as never }),
        },
        requestUpload: { request: (input) => run('requestUpload', input, UPLOAD) },
        send: {
          send: (input) =>
            run('send', input, { message: MESSAGE as never, replayed: params.replayed ?? false }),
        },
      }),
    ],
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'office-subject-conversation-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function request(method: 'GET' | 'POST', path: string, body?: unknown, headers = {}): Request {
  return new Request(`${FRONTEND_ORIGIN}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      'content-type': 'application/json',
      origin: FRONTEND_ORIGIN,
      'x-correlation-id': 'office-subject-conversation-correlation',
      ...headers,
    },
    method,
  })
}

const subjectPath = (subjectType: string, rest: string, subjectId = SUBJECT_ID) =>
  `${BASE}/${subjectType}/${subjectId}/${rest}`
const unused = new Proxy({}, { get: () => () => undefined })

describe('a tabela das rotas do escritório por assunto (spec 263 T2.4b)', () => {
  test('cada rota nova com a política e o limite do contrato', () => {
    const rows = [
      ...createOfficeSubjectConversationRoutes(unused as never),
      ...createOfficeSubjectConversationWriteRoutes(unused as never),
    ].map(({ method, pathname, policy, rateLimit }) => ({ method, pathname, policy, rateLimit }))

    expect(rows).toEqual([
      {
        method: 'GET',
        pathname: BASE.replace(TRIP_ID, ':tripId'),
        policy: READ,
        rateLimit: undefined,
      },
      {
        method: 'GET',
        pathname: `${BASE.replace(TRIP_ID, ':tripId')}/:subjectType/:subjectId/messages`,
        policy: READ,
        rateLimit: undefined,
      },
      {
        method: 'POST',
        pathname: `${BASE.replace(TRIP_ID, ':tripId')}/:subjectType/:subjectId/messages/read`,
        policy: READ,
        rateLimit: undefined,
      },
      {
        method: 'POST',
        pathname: `${BASE.replace(TRIP_ID, ':tripId')}/open`,
        policy: WRITE,
        rateLimit: OFFICE_SUBJECT_CONVERSATION_STATE_RATE_LIMIT,
      },
      {
        method: 'POST',
        pathname: `${BASE.replace(TRIP_ID, ':tripId')}/:subjectType/:subjectId/close`,
        policy: WRITE,
        rateLimit: OFFICE_SUBJECT_CONVERSATION_STATE_RATE_LIMIT,
      },
      {
        method: 'POST',
        pathname: `${BASE.replace(TRIP_ID, ':tripId')}/:subjectType/:subjectId/messages`,
        policy: WRITE,
        rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
      },
      {
        method: 'POST',
        pathname: `${BASE.replace(TRIP_ID, ':tripId')}/:subjectType/:subjectId/uploads`,
        policy: WRITE,
        rateLimit: OCCURRENCE_CONVERSATION_UPLOAD_RATE_LIMIT,
      },
    ])
    expect(OFFICE_SUBJECT_CONVERSATION_STATE_RATE_LIMIT).toEqual({
      maxRequests: 60,
      scope: 'office-subject-conversation-state',
      store: 'postgres',
      windowSeconds: 300,
    })
  })

  test('as rotas antigas do escritório seguem as mesmas: política, limite e caminho', () => {
    const table = createOccurrenceConversationRoutes(unused as never).map(
      ({ method, pathname, policy, rateLimit }) => ({ method, pathname, policy, rateLimit }),
    )

    expect(table).toEqual([
      {
        method: 'GET',
        pathname: '/trip-occurrences/:id/conversations',
        policy: READ,
        rateLimit: undefined,
      },
      {
        method: 'POST',
        pathname: '/trip-occurrences/:id/conversations/:participant/messages',
        policy: RESOLVE,
        rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
      },
      {
        method: 'POST',
        pathname: '/trip-occurrences/:id/conversations/:participant/uploads',
        policy: RESOLVE,
        rateLimit: OCCURRENCE_CONVERSATION_UPLOAD_RATE_LIMIT,
      },
      {
        method: 'POST',
        pathname: '/trip-occurrences/:id/conversations/contractor/mail-preview',
        policy: RESOLVE,
        rateLimit: undefined,
      },
      {
        method: 'POST',
        pathname: '/occurrence-conversations/:id/read',
        policy: READ,
        rateLimit: undefined,
      },
    ])
    expect(OCCURRENCE_CONVERSATION_RATE_LIMIT).toEqual({
      maxRequests: 30,
      scope: 'occurrence-conversation',
      store: 'postgres',
      windowSeconds: 300,
    })
  })
})

describe('ler pelo escritório (spec 263 T2.4b)', () => {
  test('a lista da viagem: 200 { data }, no-store, com a empresa e o usuário do contexto', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(request('GET', BASE))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toEqual({ data: [SUMMARY] })
    expect(fixture.calls).toEqual([
      {
        input: {
          companyId: COMPANY_CONTEXT.companyId,
          tripId: TRIP_ID,
          userId: COMPANY_CONTEXT.userId,
        },
        name: 'list',
      },
    ])
  })

  test('mensagens: o assunto do caminho, before e limit validados; nota e viagem, nunca ocorrência', async () => {
    for (const subjectType of ['document', 'trip']) {
      const fixture = createFixture()
      const response = await fixture.handle(
        request('GET', `${subjectPath(subjectType, 'messages')}?before=${ATTACHMENT_ID}&limit=20`),
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ data: [MESSAGE] })
      expect(fixture.calls).toEqual([
        {
          input: {
            before: ATTACHMENT_ID,
            companyId: COMPANY_CONTEXT.companyId,
            limit: 20,
            subjectId: SUBJECT_ID,
            subjectType,
            tripId: TRIP_ID,
          },
          name: 'messages',
        },
      ])
    }
    const fixture = createFixture()
    for (const path of [
      subjectPath('occurrence', 'messages'),
      subjectPath('webchat', 'messages'),
      subjectPath('document', 'messages', 'nao-e-uuid'),
      `${subjectPath('document', 'messages')}?limit=101`,
      `${subjectPath('document', 'messages')}?before=nao-e-uuid`,
      `${subjectPath('document', 'messages')}?outro=1`,
    ]) {
      expect((await fixture.handle(request('GET', path))).status).toBe(400)
    }
    expect(fixture.calls).toEqual([])
  })

  test('marcar como lida: 204 sem corpo, e ocorrência é 400', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      request('POST', subjectPath('trip', 'messages/read', TRIP_ID)),
    )
    expect(response.status).toBe(204)
    expect(fixture.calls[0]).toMatchObject({
      input: {
        companyId: COMPANY_CONTEXT.companyId,
        subjectType: 'trip',
        tripId: TRIP_ID,
        userId: COMPANY_CONTEXT.userId,
      },
      name: 'markRead',
    })
    const occurrence = await fixture.handle(
      request('POST', subjectPath('occurrence', 'messages/read')),
    )
    expect(occurrence.status).toBe(400)
  })

  test('fleet.read lê e não escreve; sem fleet.read nada responde', async () => {
    const reader = createFixture({ permissions: new Set(['fleet.read'] as const) })
    expect((await reader.handle(request('GET', BASE))).status).toBe(200)
    expect((await reader.handle(request('GET', subjectPath('document', 'messages')))).status).toBe(
      200,
    )
    expect(
      (await reader.handle(request('POST', subjectPath('document', 'messages/read')))).status,
    ).toBe(204)
    for (const [path, body] of [
      [`${BASE}/open`, { subjectId: SUBJECT_ID, subjectType: 'document' }],
      [subjectPath('document', 'close'), undefined],
      [subjectPath('document', 'messages'), { body: 'oi' }],
      [
        subjectPath('document', 'uploads'),
        { contentType: 'image/jpeg', fileName: 'a.jpg', sizeBytes: 10 },
      ],
    ] as const) {
      expect(
        (await reader.handle(request('POST', path, body, { 'idempotency-key': KEY }))).status,
      ).toBe(403)
    }
    expect(reader.calls.map((call) => call.name)).toEqual(['list', 'messages', 'markRead'])

    const nobody = createFixture({ permissions: new Set(['trip.report'] as const) })
    expect((await nobody.handle(request('GET', BASE))).status).toBe(403)
  })
})

describe('abrir, encerrar, enviar e anexar (spec 263 T2.4b)', () => {
  test('abrir: 201 na criação e 200 na repetição, com o resumo; corpo estrito', async () => {
    const created = await createFixture({ created: true }).handle(
      request('POST', `${BASE}/open`, { subjectId: SUBJECT_ID, subjectType: 'document' }),
    )
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ data: SUMMARY })
    const fixture = createFixture({ created: false })
    const again = await fixture.handle(
      request('POST', `${BASE}/open`, { subjectId: SUBJECT_ID, subjectType: 'trip' }),
    )
    expect(again.status).toBe(200)
    expect(fixture.calls).toEqual([
      {
        input: {
          companyId: COMPANY_CONTEXT.companyId,
          subjectId: SUBJECT_ID,
          subjectType: 'trip',
          tripId: TRIP_ID,
          userId: COMPANY_CONTEXT.userId,
        },
        name: 'open',
      },
    ])
    const invalid = createFixture()
    for (const body of [
      {},
      { subjectId: SUBJECT_ID, subjectType: 'occurrence' },
      { subjectId: 'nao-e-uuid', subjectType: 'document' },
      { subjectId: SUBJECT_ID, subjectType: 'document', participant: 'driver' },
    ]) {
      expect((await invalid.handle(request('POST', `${BASE}/open`, body))).status).toBe(400)
    }
    expect(invalid.calls).toEqual([])
  })

  test('encerrar: 200 com o resumo; ocorrência nunca fecha (400)', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(request('POST', subjectPath('document', 'close')))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: SUMMARY })
    expect(fixture.calls[0]).toMatchObject({
      name: 'close',
      input: { subjectType: 'document', tripId: TRIP_ID },
    })
    const occurrence = await fixture.handle(request('POST', subjectPath('occurrence', 'close')))
    expect(occurrence.status).toBe(400)
    expect(fixture.calls).toHaveLength(1)
  })

  test('enviar: 201 na primeira vez, 200 na repetição, { data: Message } e o autor do contexto', async () => {
    const send = (fixture: ReturnType<typeof createFixture>, key: null | string = KEY) =>
      fixture.handle(
        request(
          'POST',
          subjectPath('document', 'messages'),
          { attachmentIds: [ATTACHMENT_ID], body: 'Pode subir?' },
          key === null ? {} : { 'idempotency-key': key },
        ),
      )
    const first = createFixture()
    const response = await send(first)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: MESSAGE })
    expect(first.calls).toEqual([
      {
        input: {
          actorUserId: COMPANY_CONTEXT.userId,
          attachmentIds: [ATTACHMENT_ID],
          bodyText: 'Pode subir?',
          companyId: COMPANY_CONTEXT.companyId,
          idempotencyKey: KEY,
          subjectId: SUBJECT_ID,
          subjectType: 'document',
          tripId: TRIP_ID,
        },
        name: 'send',
      },
    ])
    expect((await send(createFixture({ replayed: true }))).status).toBe(200)

    const invalid = createFixture()
    for (const key of [null, 'curta', 'chave com espaço 0001']) {
      expect((await send(invalid, key)).status).toBe(400)
    }
    expect(invalid.calls).toEqual([])
  })

  test('enviar: corpo inválido, canal a mais ou ocorrência no caminho são 400', async () => {
    const fixture = createFixture()
    for (const [path, body] of [
      [subjectPath('document', 'messages'), {}],
      [subjectPath('document', 'messages'), { body: 'x'.repeat(8001) }],
      [subjectPath('document', 'messages'), { body: 'ok', channel: 'whatsapp' }],
      [subjectPath('document', 'messages'), { attachmentIds: ['nao-e-uuid'], body: 'ok' }],
      [subjectPath('occurrence', 'messages'), { body: 'ok' }],
    ] as const) {
      const response = await fixture.handle(request('POST', path, body, { 'idempotency-key': KEY }))
      expect(response.status).toBe(400)
    }
    expect(fixture.calls).toEqual([])
  })

  test('pedir a subida: 201 com a forma de hoje, corpo estrito', async () => {
    const body = { contentType: 'image/jpeg', fileName: 'foto.jpg', sizeBytes: 1000 }
    const fixture = createFixture()
    const response = await fixture.handle(
      request('POST', subjectPath('trip', 'uploads', TRIP_ID), body),
    )
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: UPLOAD })
    expect(fixture.calls[0]).toMatchObject({
      input: { ...body, actorUserId: COMPANY_CONTEXT.userId, subjectType: 'trip', tripId: TRIP_ID },
      name: 'requestUpload',
    })
    for (const invalid of [{}, { ...body, sizeBytes: 0 }, { ...body, participant: 'driver' }]) {
      expect(
        (await fixture.handle(request('POST', subjectPath('trip', 'uploads'), invalid))).status,
      ).toBe(400)
    }
    expect(fixture.calls).toHaveLength(1)
  })

  test('os erros do caso de uso saem com o código e o status do contrato', async () => {
    const cases = [
      { code: 'CONVERSATION_NOT_FOUND', error: new ConversationNotFoundError(), status: 404 },
      { code: 'CONVERSATION_CLOSED', error: new ConversationClosedError(), status: 409 },
      { code: 'CONVERSATION_NO_DRIVER', error: new ConversationNoDriverError(), status: 409 },
    ]
    for (const item of cases) {
      const fixture = createFixture({ error: item.error })
      for (const response of [
        await fixture.handle(request('GET', BASE)),
        await fixture.handle(
          request('POST', `${BASE}/open`, { subjectId: SUBJECT_ID, subjectType: 'trip' }),
        ),
        await fixture.handle(
          request(
            'POST',
            subjectPath('document', 'messages'),
            { body: 'ok' },
            { 'idempotency-key': KEY },
          ),
        ),
      ]) {
        expect(response.status).toBe(item.status)
        expect((await responseApiError(response)).code).toBe(item.code)
      }
    }
  })
})
