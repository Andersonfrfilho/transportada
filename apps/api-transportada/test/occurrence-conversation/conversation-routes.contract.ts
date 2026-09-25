/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T404 (RF6, RF7, RF15): as rotas da conversa da ocorrência. Ler e marcar como lida é da
 * listagem (`fleet.read`); escrever à contratante e ver a prévia é de quem conduz a tratativa
 * (`occurrences.resolve`) — o separador tem `trip.manage` e **não** alcança o envio (143 T016). A
 * rota que dispara e-mail conta no Postgres, e nenhum log leva assunto, corpo ou endereço.
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
import type { OccurrenceConversationsView } from '../../src/occurrence-conversation/application/occurrence-conversation.port.js'
import { createOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/occurrence-conversation.routes.js'
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

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000183501'
const CONVERSATION_ID = '00000000-0000-4000-8000-000000183502'

const VIEW: OccurrenceConversationsView = {
  contractorPortal: { available: false },
  conversations: [
    {
      id: CONVERSATION_ID,
      messages: [],
      participant: 'contractor',
      status: 'open',
      unreadCount: 0,
    },
  ],
}

type Calls = { readonly name: string; readonly input: unknown }[]

function createFixture(params: {
  readonly error?: Error
  readonly logs?: unknown[]
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: Calls = []
  const record = (name: string) => async (input: unknown) => {
    calls.push({ input, name })
    if (params.error !== undefined) throw params.error
    return name === 'list'
      ? VIEW
      : name === 'send'
        ? {
            conversationId: CONVERSATION_ID,
            conversationMessageId: 'message-1',
            mailMessageId: 'mail-1',
            recipientCount: 2,
            threadId: 'thread-1',
          }
        : name === 'sendDriverApp'
          ? { conversationId: CONVERSATION_ID, conversationMessageId: 'message-app' }
          : name === 'preview'
            ? { bodyText: 'x', html: '<p>x</p>', subject: 's', suggested: false, text: 'x' }
            : { unreadCount: 0 }
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'occurrence-conversation-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: {
      ...COMPANY_CONTEXT,
      permissions: params.permissions ?? new Set(['fleet.read', 'occurrences.resolve'] as const),
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
    routes: createOccurrenceConversationRoutes({
      listConversations: { list: record('list') as never },
      markRead: { markRead: record('read') as never },
      sendDriverApp: { send: record('sendDriverApp') as never },
      sendPortal: { send: record('sendPortal') as never },
      previewMail: { preview: record('preview') as never },
      sendMail: { send: record('send') as never },
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'conversation-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: {
      error: (...args: unknown[]) => params.logs?.push(args),
      info: (...args: unknown[]) => params.logs?.push(args),
      warn: (...args: unknown[]) => params.logs?.push(args),
    },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    calls,
    context,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
  }
}

function sendRequest(
  body: unknown,
  headers: Record<string, string> = { 'idempotency-key': 'conversation-key-0001' },
) {
  const request = jsonRequest({
    body,
    method: 'POST',
    path: `/trip-occurrences/${OCCURRENCE_ID}/conversations/contractor/messages`,
  })
  for (const [name, value] of Object.entries(headers)) request.headers.set(name, value)
  return request
}

const MAIL_BODY = {
  body: 'Recebedor cobrando descarga. Autorizam?',
  channel: 'email',
  contactIds: ['00000000-0000-4000-8000-000000183503'],
  subject: 'Ocorrência — NF 4512',
}

describe('GET /trip-occurrences/:id/conversations (spec 183 T404)', () => {
  test('com fleet.read lista as conversas do usuário do contexto, sem cache', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read'] as const) })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `/trip-occurrences/${OCCURRENCE_ID}/conversations` }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: VIEW })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(fixture.calls).toEqual([
      {
        input: {
          companyId: COMPANY_CONTEXT.companyId,
          occurrenceId: OCCURRENCE_ID,
          userId: COMPANY_CONTEXT.userId,
        },
        name: 'list',
      },
    ])
  })

  test('só com trip.read é 403; ocorrência de outra empresa é 404', async () => {
    const reader = createFixture({ permissions: new Set(['trip.read'] as const) })
    expect(
      (
        await reader.handle(
          jsonRequest({ method: 'GET', path: `/trip-occurrences/${OCCURRENCE_ID}/conversations` }),
        )
      ).status,
    ).toBe(403)

    const missing = createFixture({ error: new TripOccurrenceNotFoundError() })
    const response = await missing.handle(
      jsonRequest({ method: 'GET', path: `/trip-occurrences/${OCCURRENCE_ID}/conversations` }),
    )
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_OCCURRENCE_NOT_FOUND')
  })
})

describe('POST /trip-occurrences/:id/conversations/:participant/messages (spec 183 T404)', () => {
  test('com occurrences.resolve envia o e-mail, com a chave e a correlação, e responde 202', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(sendRequest(MAIL_BODY))

    expect(response.status).toBe(202)
    expect(fixture.calls).toEqual([
      {
        input: {
          actorUserId: COMPANY_CONTEXT.userId,
          bodyText: MAIL_BODY.body,
          companyId: COMPANY_CONTEXT.companyId,
          contactIds: MAIL_BODY.contactIds,
          correlationId: 'trip-http-correlation',
          idempotencyKey: 'conversation-key-0001',
          occurrenceId: OCCURRENCE_ID,
          subject: MAIL_BODY.subject,
        },
        name: 'send',
      },
    ])
  })

  test('o separador (trip.manage + fleet.read) não envia: 403 antes do caso de uso', async () => {
    const fixture = createFixture({
      permissions: new Set(['fleet.read', 'trip.manage', 'trip.read'] as const),
    })
    const response = await fixture.handle(sendRequest(MAIL_BODY))

    expect(response.status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('sem Idempotency-Key, com campo desconhecido ou sem assunto é 400', async () => {
    const fixture = createFixture({})
    expect((await fixture.handle(sendRequest(MAIL_BODY, {}))).status).toBe(400)
    expect(
      (await fixture.handle(sendRequest({ ...MAIL_BODY, cc: ['x@example.test'] }))).status,
    ).toBe(400)
    expect(
      (
        await fixture.handle(
          sendRequest({ body: MAIL_BODY.body, channel: 'email', contactIds: MAIL_BODY.contactIds }),
        )
      ).status,
    ).toBe(400)
    expect(fixture.calls).toEqual([])
  })

  test('canal ou participante que ainda não tem envio é 422, sem chegar ao caso de uso', async () => {
    const fixture = createFixture({})
    const whatsapp = await fixture.handle(sendRequest({ ...MAIL_BODY, channel: 'whatsapp' }))
    expect(whatsapp.status).toBe(422)
    expect((await responseApiError(whatsapp)).code).toBe(
      'OCCURRENCE_CONVERSATION_CHANNEL_UNAVAILABLE',
    )

    const driver = jsonRequest({
      body: MAIL_BODY,
      method: 'POST',
      path: `/trip-occurrences/${OCCURRENCE_ID}/conversations/driver/messages`,
    })
    driver.headers.set('idempotency-key', 'conversation-key-0002')
    expect((await fixture.handle(driver)).status).toBe(422)
    expect(fixture.calls).toEqual([])
  })

  test('ao motorista pelo app: só corpo e canal, com a chave, e responde 202 (spec 183 T601)', async () => {
    const fixture = createFixture({})
    const request = jsonRequest({
      body: { body: 'Pode aguardar na doca?', channel: 'app' },
      method: 'POST',
      path: `/trip-occurrences/${OCCURRENCE_ID}/conversations/driver/messages`,
    })
    request.headers.set('idempotency-key', 'conversation-key-0003')

    const response = await fixture.handle(request)

    expect(response.status).toBe(202)
    expect(fixture.calls).toEqual([
      {
        input: {
          actorUserId: COMPANY_CONTEXT.userId,
          bodyText: 'Pode aguardar na doca?',
          companyId: COMPANY_CONTEXT.companyId,
          idempotencyKey: 'conversation-key-0003',
          occurrenceId: OCCURRENCE_ID,
        },
        name: 'sendDriverApp',
      },
    ])
  })

  test('app para a contratante e campo a mais no app não passam (spec 183 T601)', async () => {
    const fixture = createFixture({})
    const toContractor = sendRequest({ body: 'Oi', channel: 'app' })
    expect((await fixture.handle(toContractor)).status).toBe(422)
    const extra = jsonRequest({
      body: { body: 'Oi', channel: 'app', subject: 'x' },
      method: 'POST',
      path: `/trip-occurrences/${OCCURRENCE_ID}/conversations/driver/messages`,
    })
    extra.headers.set('idempotency-key', 'conversation-key-0004')
    expect((await fixture.handle(extra)).status).toBe(400)
    expect(fixture.calls).toEqual([])
  })

  test('nenhum log leva assunto, corpo ou destinatário', async () => {
    const logs: unknown[] = []
    const fixture = createFixture({ error: new Error('boom'), logs })
    await fixture.handle(sendRequest(MAIL_BODY))

    const serialized = JSON.stringify(logs)
    expect(serialized).not.toContain(MAIL_BODY.subject)
    expect(serialized).not.toContain(MAIL_BODY.body)
  })
})

describe('prévia e leitura (spec 183 T404)', () => {
  test('a prévia é de quem envia, e repassa o texto do operador', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { body: 'Texto', subject: 'Assunto' },
        method: 'POST',
        path: `/trip-occurrences/${OCCURRENCE_ID}/conversations/contractor/mail-preview`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.calls[0]).toEqual({
      input: {
        actorUserId: COMPANY_CONTEXT.userId,
        bodyText: 'Texto',
        companyId: COMPANY_CONTEXT.companyId,
        occurrenceId: OCCURRENCE_ID,
        subject: 'Assunto',
      },
      name: 'preview',
    })

    const separator = createFixture({
      permissions: new Set(['fleet.read', 'trip.manage'] as const),
    })
    expect(
      (
        await separator.handle(
          jsonRequest({
            body: {},
            method: 'POST',
            path: `/trip-occurrences/${OCCURRENCE_ID}/conversations/contractor/mail-preview`,
          }),
        )
      ).status,
    ).toBe(403)
  })

  test('marcar como lida é da leitura (fleet.read), por usuário, e não avisa ninguém', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read'] as const) })
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `/occurrence-conversations/${CONVERSATION_ID}/read` }),
    )

    expect(response.status).toBe(200)
    expect(fixture.calls).toEqual([
      {
        input: {
          companyId: COMPANY_CONTEXT.companyId,
          conversationId: CONVERSATION_ID,
          userId: COMPANY_CONTEXT.userId,
        },
        name: 'read',
      },
    ])
  })
})
