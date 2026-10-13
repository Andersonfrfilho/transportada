/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.4b (RF2): a porta do robô do varredor de e-mail automático — permissão só do serviço,
 * empresa do contexto, corpo vazio e o mapa dos resultados. A decisão de enviar é do caso de uso
 * (`send-automatic-occurrence-mail`); aqui só a superfície HTTP.
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
import type { AutomaticOccurrenceMailResult } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { OccurrenceConversationIdempotencyKeyReusedError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { createOccurrenceAutomaticMailRoutes } from '../../src/occurrence-conversation/presentation/occurrence-automatic-mail.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  CORRELATION_ID,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'

const OCCURRENCE_ID = '00000000-0000-4000-8000-00000000e001'
const AUTOMATIC_MAIL_PATH = `/trip-occurrences/${OCCURRENCE_ID}/automatic-mail`
const SERVICE_PERMISSIONS: CompanyContext['permissions'] = new Set(['occurrence.automatic-mail'])
const SENT: AutomaticOccurrenceMailResult = {
  outcome: 'sent',
  recipientCount: 2,
  whatsappFallbackCount: 0,
  whatsappUnreachableCount: 0,
}

function createFixture(params: {
  readonly error?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly result?: AutomaticOccurrenceMailResult
}) {
  const calls: unknown[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: true,
      subject: 'occurrence-automatic-mail-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions: params.permissions ?? SERVICE_PERMISSIONS },
  }
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: { authenticate: async () => context.identity },
    authorization: { authorize: (value, policy) => authorization.authorize(value, policy) },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    userPictureExistence: stubUserPictureExistence(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    routes: createOccurrenceAutomaticMailRoutes({
      sendAutomaticMail: {
        send: async (input) => {
          calls.push(input)
          if (params.error !== undefined) throw params.error
          return params.result ?? SENT
        },
      },
    }),
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function post(fixture: ReturnType<typeof createFixture>, body?: unknown) {
  return fixture.handle(
    jsonRequest({
      ...(body === undefined ? {} : { body }),
      method: 'POST',
      path: AUTOMATIC_MAIL_PATH,
    }),
  )
}

describe('o envio automático pela porta do robô é só da permissão de serviço', () => {
  test('quem tem trip.manage mas não a permissão do robô recebe 403 e o caso de uso não roda', async () => {
    const fixture = createFixture({
      permissions: new Set(['trip.manage', 'trip.canhoto-auto-review']),
    })

    expect((await post(fixture)).status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('a empresa vem do contexto e a correlação do pedido, nunca do corpo', async () => {
    const fixture = createFixture({})

    const smuggled = await post(fixture, { companyId: crypto.randomUUID() })
    expect(smuggled.status).toBe(400)
    expect(fixture.calls).toEqual([])

    const response = await post(fixture)
    expect(response.status).toBe(200)
    expect(fixture.calls[0]).toEqual({
      companyId: COMPANY_CONTEXT.companyId,
      correlationId: CORRELATION_ID,
      occurrenceId: OCCURRENCE_ID,
    })
  })

  test('identificador que não é UUID nunca chega ao caso de uso (o roteador responde 404)', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: '/trip-occurrences/nao-e-uuid/automatic-mail' }),
    )

    expect(response.status).toBe(404)
    expect(fixture.calls).toEqual([])
  })
})

describe('o resultado do caso de uso vira resposta', () => {
  test('enviado: 200 com o desfecho e as contagens, sem endereço nem texto', async () => {
    const response = await post(createFixture({}))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        outcome: 'sent',
        recipientCount: 2,
        whatsappFallbackCount: 0,
        whatsappUnreachableCount: 0,
      },
    })
  })

  test('motivo para não enviar é 200 skipped com o motivo, não erro', async () => {
    const fixture = createFixture({ result: { outcome: 'skipped', reason: 'no_recipient' } })

    const response = await post(fixture)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { outcome: 'skipped', reason: 'no_recipient' } })
  })

  test('chave de idempotência já usada responde already_sent, não erro', async () => {
    const fixture = createFixture({ error: new OccurrenceConversationIdempotencyKeyReusedError() })

    const response = await post(fixture)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { outcome: 'already_sent' } })
  })

  test('ocorrência de outra empresa, inexistente ou que não é de nota responde 404 igual', async () => {
    const fixture = createFixture({ result: { outcome: 'skipped', reason: 'not_document' } })

    const response = await post(fixture)

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CONVERSATION_NOT_FOUND')
  })

  test('falha inesperada não vira already_sent: segue para o filtro global', async () => {
    const fixture = createFixture({ error: new Error('boom') })

    expect((await post(fixture)).status).toBe(500)
  })
})
