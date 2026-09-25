/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): as rotas do anexo nas três superfícies. O pedido de upload só leva o que o
 * cliente declara (tipo, nome e tamanho); empresa, quem pede, ocorrência e participante vêm do
 * contexto e do caminho. O envio aceita até cinco `attachmentIds`, e o e-mail ainda não leva anexo
 * (T702e) — o corpo estrito recusa. Toda rota de upload tem teto próprio no Postgres.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter, type defineRoute } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createClientOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/client-occurrence-conversation.routes.js'
import { createMeOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/me-occurrence-conversation.routes.js'
import { createOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/occurrence-conversation.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import { jsonRequest } from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000183701'
const DRIVER_ID = '00000000-0000-4000-8000-000000183702'
const UPLOAD_A = '00000000-0000-4000-8000-000000183703'
const UPLOAD_B = '00000000-0000-4000-8000-000000183704'
const REF = 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY'
const UPLOAD_RESULT = {
  expiresAt: '2026-09-25T12:15:00.000Z',
  uploadId: UPLOAD_A,
  uploadUrl: 'https://s3.test/occurrence-conversations/token?upload',
}
const DECLARED = { contentType: 'application/pdf', fileName: 'comprovante.pdf', sizeBytes: 2048 }

type Calls = { input: unknown; name: string }[]

function recorder(calls: Calls, name: string, result: unknown = {}) {
  return async (input: unknown) => {
    calls.push({ input, name })
    return result as never
  }
}

function harness(
  routes: readonly ReturnType<typeof defineRoute>[],
  permissions: CompanyContext['permissions'],
) {
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'conversation-attachment-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions },
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
    routes,
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'attachment-correlation',
    frontendOrigins: ['http://127.0.0.1:53000'],
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    requestTimeoutSeconds: 10,
    router,
  })
  return (request: Request) => handleRequest(request, { timeout() {} })
}

function post(path: string, body: unknown, idempotencyKey?: string): Request {
  const request = jsonRequest({ body, method: 'POST', path })
  if (idempotencyKey !== undefined) request.headers.set('idempotency-key', idempotencyKey)
  return request
}

function operatorRoutes(calls: Calls) {
  return createOccurrenceConversationRoutes({
    listConversations: { list: recorder(calls, 'list') },
    markRead: { markRead: recorder(calls, 'read') },
    previewMail: { preview: recorder(calls, 'preview') },
    requestUpload: { request: recorder(calls, 'requestUpload', UPLOAD_RESULT) },
    sendDriverApp: { send: recorder(calls, 'sendDriverApp', { conversationId: 'c' }) },
    sendMail: { send: recorder(calls, 'sendMail', { conversationId: 'c' }) },
    sendPortal: { send: recorder(calls, 'sendPortal', { conversationId: 'c' }) },
  })
}

describe('o anexo nas rotas do operador (spec 183 T702a)', () => {
  const OPERATOR = new Set(['fleet.read', 'occurrences.resolve'] as const)
  const uploadPath = (participant: string) =>
    `/trip-occurrences/${OCCURRENCE_ID}/conversations/${participant}/uploads`

  test('o pedido de upload leva empresa e quem pede do contexto', async () => {
    const calls: Calls = []
    const handle = harness(operatorRoutes(calls), OPERATOR)

    const response = await handle(post(uploadPath('driver'), { ...DECLARED, channel: 'app' }))

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: UPLOAD_RESULT })
    expect(calls).toEqual([
      {
        input: {
          ...DECLARED,
          actorUserId: COMPANY_CONTEXT.userId,
          channel: 'app',
          companyId: COMPANY_CONTEXT.companyId,
          occurrenceId: OCCURRENCE_ID,
          participant: 'driver',
        },
        name: 'requestUpload',
      },
    ])
  })

  test.each([
    ['empresa no corpo', { ...DECLARED, channel: 'portal', companyId: 'x' }],
    ['tamanho que não é inteiro', { ...DECLARED, channel: 'portal', sizeBytes: 1.5 }],
    ['nome vazio', { ...DECLARED, channel: 'portal', fileName: '' }],
    ['sem canal', DECLARED],
  ])('corpo inválido é 400 sem chamar nada: %s', async (_label, body) => {
    const calls: Calls = []
    const handle = harness(operatorRoutes(calls), OPERATOR)

    const response = await handle(post(uploadPath('contractor'), body))

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  test('quem só lê (fleet.read) não pede upload', async () => {
    const calls: Calls = []
    const handle = harness(operatorRoutes(calls), new Set(['fleet.read'] as const))

    const response = await handle(post(uploadPath('driver'), { ...DECLARED, channel: 'app' }))

    expect(response.status).toBe(403)
    expect(calls).toEqual([])
  })

  test('o envio pelo app e pelo portal leva os anexos; mais de cinco é 400', async () => {
    const calls: Calls = []
    const handle = harness(operatorRoutes(calls), OPERATOR)
    const messages = (participant: string) =>
      `/trip-occurrences/${OCCURRENCE_ID}/conversations/${participant}/messages`

    const app = await handle(
      post(
        messages('driver'),
        { attachmentIds: [UPLOAD_A], body: '', channel: 'app' },
        'attachment-app-key-01',
      ),
    )
    const portal = await handle(
      post(
        messages('contractor'),
        { attachmentIds: [UPLOAD_A, UPLOAD_B], body: 'Segue.', channel: 'portal' },
        'attachment-portal-key-1',
      ),
    )
    const tooMany = await handle(
      post(
        messages('driver'),
        {
          attachmentIds: Array.from({ length: 6 }, () => crypto.randomUUID()),
          body: '',
          channel: 'app',
        },
        'attachment-many-key-01',
      ),
    )
    const notUuid = await handle(
      post(
        messages('driver'),
        { attachmentIds: ['upload-1'], body: '', channel: 'app' },
        'attachment-uuid-key-01',
      ),
    )

    expect([app.status, portal.status, tooMany.status, notUuid.status]).toEqual([
      202, 202, 400, 400,
    ])
    expect(
      calls.map((call) => [call.name, (call.input as { attachmentIds?: unknown }).attachmentIds]),
    ).toEqual([
      ['sendDriverApp', [UPLOAD_A]],
      ['sendPortal', [UPLOAD_A, UPLOAD_B]],
    ])
  })

  test('e-mail ainda não leva anexo (T702e): o corpo estrito recusa', async () => {
    const calls: Calls = []
    const handle = harness(operatorRoutes(calls), OPERATOR)

    const response = await handle(
      post(
        `/trip-occurrences/${OCCURRENCE_ID}/conversations/contractor/messages`,
        {
          attachmentIds: [UPLOAD_A],
          body: 'Segue.',
          channel: 'email',
          contactIds: [UPLOAD_B],
          subject: 'Ocorrência',
        },
        'attachment-mail-key-01',
      ),
    )

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })
})

describe('o anexo nas rotas do motorista (spec 183 T702a)', () => {
  function routes(calls: Calls) {
    return createMeOccurrenceConversationRoutes({
      inbox: { list: recorder(calls, 'inbox', []) },
      list: { list: recorder(calls, 'list', []) },
      markRead: { markRead: recorder(calls, 'markRead') },
      reply: { reply: recorder(calls, 'reply', { createdAt: 'x' }) },
      requestUpload: { request: recorder(calls, 'requestUpload', UPLOAD_RESULT) },
      resolveDriverId: async () => DRIVER_ID,
    })
  }
  const DRIVER = new Set(['trip.read', 'trip.report'] as const)

  test('o motorista pede upload para a própria conversa (trip.report)', async () => {
    const calls: Calls = []
    const handle = harness(routes(calls), DRIVER)

    const response = await handle(
      post(`/me/trips/current/occurrences/${OCCURRENCE_ID}/uploads`, DECLARED),
    )

    expect(response.status).toBe(201)
    expect(calls).toEqual([
      {
        input: {
          ...DECLARED,
          companyId: COMPANY_CONTEXT.companyId,
          driverId: DRIVER_ID,
          driverUserId: COMPANY_CONTEXT.userId,
          occurrenceId: OCCURRENCE_ID,
        },
        name: 'requestUpload',
      },
    ])

    const forbidden = await harness(
      routes([]),
      new Set(['trip.read'] as const),
    )(post(`/me/trips/current/occurrences/${OCCURRENCE_ID}/uploads`, DECLARED))
    expect(forbidden.status).toBe(403)
  })

  test('a resposta leva os anexos, e o canal no corpo é recusado', async () => {
    const calls: Calls = []
    const handle = harness(routes(calls), DRIVER)
    const path = `/me/trips/current/occurrences/${OCCURRENCE_ID}/messages`

    const ok = await handle(
      post(path, { attachmentIds: [UPLOAD_A], body: '' }, 'driver-file-key-0001'),
    )
    const withChannel = await handle(
      post(path, { attachmentIds: [UPLOAD_A], body: '', channel: 'app' }, 'driver-file-key-0002'),
    )

    expect([ok.status, withChannel.status]).toEqual([201, 400])
    expect(calls.map((call) => call.name)).toEqual(['reply'])
    expect(calls[0]?.input).toMatchObject({ attachmentIds: [UPLOAD_A] })
  })
})

describe('o anexo nas rotas do portal (spec 183 T702a)', () => {
  function routes(calls: Calls) {
    return createClientOccurrenceConversationRoutes({
      conversation: {
        conversationRefs: async () => new Map(),
        markRead: recorder(calls, 'markRead'),
        read: recorder(calls, 'read', { messages: [], unreadCount: 0 }),
        send: recorder(calls, 'send', { createdAt: 'x' }),
      },
      requestUpload: { request: recorder(calls, 'requestUpload', UPLOAD_RESULT) },
    })
  }
  const PORTAL = new Set(['deliveries.track'] as const)

  test('a contratante pede upload pela referência, e o contexto vai inteiro', async () => {
    const calls: Calls = []
    const handle = harness(routes(calls), PORTAL)

    const response = await handle(
      post(`/client/me/occurrence-conversations/${REF}/uploads`, DECLARED),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: UPLOAD_RESULT })
    expect(calls[0]).toMatchObject({
      input: { ...DECLARED, context: { companyId: COMPANY_CONTEXT.companyId }, ref: REF },
      name: 'requestUpload',
    })
  })

  test('o envio leva até cinco anexos', async () => {
    const calls: Calls = []
    const handle = harness(routes(calls), PORTAL)
    const path = `/client/me/occurrence-conversations/${REF}/messages`

    const ok = await handle(
      post(path, { attachmentIds: [UPLOAD_A], body: '' }, 'portal-file-key-0001'),
    )
    const tooMany = await handle(
      post(
        path,
        { attachmentIds: Array.from({ length: 6 }, () => crypto.randomUUID()), body: '' },
        'portal-file-key-0002',
      ),
    )

    expect([ok.status, tooMany.status]).toEqual([201, 400])
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toMatchObject({ attachmentIds: [UPLOAD_A] })
  })
})
