/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505 (RF9): as rotas da fila de mensagens sem conversa. Ler é da listagem (`fleet.read`);
 * atribuir é de quem conduz a tratativa (`occurrences.resolve`) — o separador tem `trip.manage` e
 * não alcança, pela mesma razão do envio (T404). Sem cache: a resposta leva telefone e corpo.
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
import { createOccurrenceConversationUnassignedRoutes } from '../../src/occurrence-conversation/presentation/occurrence-conversation-unassigned.routes.js'
import { OccurrenceConversationAlreadyAssignedError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const UNASSIGNED_ID = '00000000-0000-4000-8000-000000183811'
const CONVERSATION_ID = '00000000-0000-4000-8000-000000183812'

function createFixture(params: {
  readonly error?: Error
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: { name: string; input: unknown }[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'occurrence-conversation-unassigned-contract',
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
    routes: createOccurrenceConversationUnassignedRoutes({
      assign: {
        assign: async (input) => {
          calls.push({ input, name: 'assign' })
          if (params.error !== undefined) throw params.error
          return { conversationId: CONVERSATION_ID, messageId: 'message-1' }
        },
      },
      list: {
        list: async (input) => {
          calls.push({ input, name: 'list' })
          return []
        },
      },
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'unassigned-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

const assignRequest = (body: unknown) =>
  jsonRequest({
    body,
    method: 'POST',
    path: `/occurrence-conversations/unassigned/${UNASSIGNED_ID}/assign`,
  })

describe('a fila de mensagens sem conversa (spec 183 T505)', () => {
  test('com fleet.read lista a fila da empresa do contexto, sem cache', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read'] as const) })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/occurrence-conversations/unassigned' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [] })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(fixture.calls).toEqual([
      { input: { companyId: COMPANY_CONTEXT.companyId }, name: 'list' },
    ])
  })

  test('atribuir é de occurrences.resolve, com o usuário do contexto', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(assignRequest({ conversationId: CONVERSATION_ID }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { conversationId: CONVERSATION_ID, messageId: 'message-1' },
    })
    expect(fixture.calls).toEqual([
      {
        input: {
          companyId: COMPANY_CONTEXT.companyId,
          conversationId: CONVERSATION_ID,
          unassignedId: UNASSIGNED_ID,
          userId: COMPANY_CONTEXT.userId,
        },
        name: 'assign',
      },
    ])
  })

  test('o separador (trip.manage + fleet.read) lê, mas não atribui', async () => {
    const fixture = createFixture({
      permissions: new Set(['fleet.read', 'trip.manage', 'trip.read'] as const),
    })
    expect((await fixture.handle(assignRequest({ conversationId: CONVERSATION_ID }))).status).toBe(
      403,
    )
    expect(fixture.calls).toEqual([])
  })

  test('corpo sem conversa, com campo a mais ou id que não é UUID é 400', async () => {
    const fixture = createFixture({})
    expect((await fixture.handle(assignRequest({}))).status).toBe(400)
    expect(
      (await fixture.handle(assignRequest({ conversationId: CONVERSATION_ID, other: 1 }))).status,
    ).toBe(400)
    expect((await fixture.handle(assignRequest({ conversationId: 'x' }))).status).toBe(400)
    expect(fixture.calls).toEqual([])
  })

  test('o erro do caso de uso sai pelo código', async () => {
    const fixture = createFixture({ error: new OccurrenceConversationAlreadyAssignedError() })
    const response = await fixture.handle(assignRequest({ conversationId: CONVERSATION_ID }))
    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CONVERSATION_ALREADY_ASSIGNED')
  })
})
