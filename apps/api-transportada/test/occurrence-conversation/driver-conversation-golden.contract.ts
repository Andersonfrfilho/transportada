/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.2/T2.3a (ADR-0101, regra do dono): o assunto novo da conversa não muda a resposta das
 * rotas do motorista. Os textos abaixo foram capturados do código de origin/staging, antes da
 * migration, passando pela rota e pelo caso de uso reais; qualquer byte diferente reprova.
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
import type { DriverConversationTransactionPort } from '../../src/occurrence-conversation/application/driver-conversation.port.js'
import {
  createListMyConversationsUseCase,
  createListMyOccurrenceConversationUseCase,
  createMarkMyConversationReadUseCase,
  createReplyMyOccurrenceConversationUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createMeOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/me-occurrence-conversation.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import {
  listNoAttachments,
  NO_ATTACHMENTS,
  UNUSED_ATTACHMENT_STORAGE,
} from '../fixtures/conversation-attachment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import { FRONTEND_ORIGIN, jsonRequest } from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000260101'
const DRIVER_ID = '00000000-0000-4000-8000-000000260102'
const NOW = new Date('2026-10-09T12:00:00.000Z')

/** A resposta de hoje da lista de mensagens, byte a byte. */
const MESSAGES_GOLDEN =
  '{"data":[{"authorName":"Maria Operadora","bodyText":"Pode aguardar na doca?","createdAt":"2026-10-09T11:00:00.000Z","direction":"outbound","id":"00000000-0000-4000-8000-000000260201","status":"delivered","attachments":[]},{"authorName":null,"bodyText":"Aguardo sim.","createdAt":"2026-10-09T11:05:00.000Z","direction":"inbound","id":"00000000-0000-4000-8000-000000260202","status":null,"attachments":[]}]}'

/** A resposta de hoje da lista de conversas do motorista, byte a byte. */
const INBOX_GOLDEN =
  '{"data":[{"lastMessageAt":"2026-10-09T11:05:00.000Z","occurrenceId":"00000000-0000-4000-8000-000000260101","occurrenceLabel":"NF 4512/1","unreadCount":1}]}'

function createTransaction(): DriverConversationTransactionPort {
  return {
    applyDriverStatus: async () => undefined,
    attachments: NO_ATTACHMENTS,
    findDriverTarget: async () => null,
    findIdempotency: async () => null,
    findMyOccurrence: async () => ({ occurrenceKind: 'document' }),
    findOrCreateDriverConversation: async () => ({
      driverUserId: COMPANY_CONTEXT.userId,
      id: 'conversation-1',
      protocol: '261009-AB12',
    }),
    insertMessage: async () => ({ id: '00000000-0000-4000-8000-000000260203' }),
    listAttachments: listNoAttachments,
    listDriverMessages: async () => [
      {
        authorName: 'Maria Operadora',
        bodyText: 'Pode aguardar na doca?',
        createdAt: new Date('2026-10-09T11:00:00.000Z'),
        direction: 'outbound',
        id: '00000000-0000-4000-8000-000000260201',
        status: 'delivered',
      },
      {
        authorName: null,
        bodyText: 'Aguardo sim.',
        createdAt: new Date('2026-10-09T11:05:00.000Z'),
        direction: 'inbound',
        id: '00000000-0000-4000-8000-000000260202',
        status: null,
      },
    ],
    listMyConversations: async () => [
      {
        lastMessageAt: new Date('2026-10-09T11:05:00.000Z'),
        occurrenceId: OCCURRENCE_ID,
        occurrenceLabel: 'NF 4512/1',
        unreadCount: 1,
      },
    ],
    saveIdempotency: async () => undefined,
  }
}

function createHandler() {
  const unitOfWork = {
    execute: async <TResult>(work: (port: DriverConversationTransactionPort) => Promise<TResult>) =>
      work(createTransaction()),
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'driver-conversation-golden-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions: new Set(['trip.read', 'trip.report'] as const) },
  }
  const authorization = new AuthorizationService()
  const fingerprintService = { create: async () => 'fingerprint' }
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
      inbox: createListMyConversationsUseCase({ clock: () => NOW, unitOfWork }),
      list: createListMyOccurrenceConversationUseCase({
        clock: () => NOW,
        storage: UNUSED_ATTACHMENT_STORAGE,
        unitOfWork,
      }),
      markRead: createMarkMyConversationReadUseCase({ clock: () => NOW, unitOfWork }),
      reply: createReplyMyOccurrenceConversationUseCase({
        clock: () => NOW,
        fingerprintService,
        storage: UNUSED_ATTACHMENT_STORAGE,
        unitOfWork,
      }),
      requestUpload: {
        request: async () => {
          throw new Error('fora do golden')
        },
      },
      resolveDriverId: async () => DRIVER_ID,
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'driver-conversation-golden-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    requestTimeoutSeconds: 10,
    router,
  })
  return (request: Request) => handleRequest(request, { timeout() {} })
}

describe('a conversa de ocorrência do motorista não muda de forma (spec 263 T2.3a)', () => {
  test('GET /me/trips/current/occurrences/:id/messages devolve os mesmos bytes de antes', async () => {
    const response = await createHandler()(
      jsonRequest({
        method: 'GET',
        path: `/me/trips/current/occurrences/${OCCURRENCE_ID}/messages`,
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(MESSAGES_GOLDEN)
  })

  test('GET /me/trips/current/occurrence-conversations devolve os mesmos bytes de antes', async () => {
    const response = await createHandler()(
      jsonRequest({ method: 'GET', path: '/me/trips/current/occurrence-conversations' }),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(INBOX_GOLDEN)
  })

  test('POST responde 201 com conversationId e messageId, sem campo novo', async () => {
    const request = jsonRequest({
      body: { body: 'Aguardo sim.' },
      method: 'POST',
      path: `/me/trips/current/occurrences/${OCCURRENCE_ID}/messages`,
    })
    request.headers.set('idempotency-key', 'driver-reply-golden-0001')
    const response = await createHandler()(request)
    expect(response.status).toBe(201)
    expect(await response.text()).toBe(
      '{"data":{"conversationId":"conversation-1","messageId":"00000000-0000-4000-8000-000000260203"}}',
    )
  })
})
