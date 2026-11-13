/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 T1 (RF5, RF6): a rota do botão "Avisar a contratante". Permissão da conversa (`occurrences.resolve`, D9),
 * corpo vazio e estrito, empresa e autor do contexto, e o mapa dos desfechos: 409 no tipo marcado pela 321 (CA05), 409
 * já avisada (CA04/D8), 404 sem ocorrência de nota, 200 com o resultado do envio.
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
import type { ManualOccurrenceNoticeResult } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createOccurrenceContractorNoticeRoutes } from '../../src/occurrence-conversation/presentation/occurrence-contractor-notice.routes.js'
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

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000324101'
const NOTICE_PATH = `/trip-occurrences/${OCCURRENCE_ID}/contractor-notice`
const OFFICE_PERMISSIONS: CompanyContext['permissions'] = new Set(['occurrences.resolve'])

function createFixture(params: {
  readonly permissions?: CompanyContext['permissions']
  readonly result?: ManualOccurrenceNoticeResult
}) {
  const calls: unknown[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'contractor-notice-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions: params.permissions ?? OFFICE_PERMISSIONS },
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
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    routes: createOccurrenceContractorNoticeRoutes({
      sendManualNotice: {
        sendManual: async (input) => {
          calls.push(input)
          return (
            params.result ?? {
              outcome: 'sent',
              recipientCount: 1,
              whatsappFallbackCount: 0,
              whatsappUnreachableCount: 0,
            }
          )
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
    jsonRequest({ ...(body === undefined ? {} : { body }), method: 'POST', path: NOTICE_PATH }),
  )
}

describe('a rota do botão "Avisar a contratante" (spec 324 T1)', () => {
  test('sem occurrences.resolve: 403 e o caso de uso não roda (o separador não avisa)', async () => {
    const fixture = createFixture({ permissions: new Set(['trip.manage', 'fleet.read']) })

    expect((await post(fixture)).status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('corpo estrito: canal, texto ou empresa no corpo são 400', async () => {
    const fixture = createFixture({})

    for (const body of [
      { channel: 'email' },
      { bodyText: 'outro texto' },
      { companyId: crypto.randomUUID() },
    ]) {
      expect((await post(fixture, body)).status).toBe(400)
    }
    expect(fixture.calls).toEqual([])
  })

  test('empresa e autor vêm do contexto', async () => {
    const fixture = createFixture({})

    const response = await post(fixture)

    expect(response.status).toBe(200)
    expect(fixture.calls).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        occurrenceId: OCCURRENCE_ID,
      },
    ])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('CA03: enviado por e-mail — 200 com o desfecho e as contagens, sem endereço nem texto', async () => {
    const response = await post(createFixture({}))

    expect(await response.json()).toEqual({
      data: {
        outcome: 'sent',
        recipientCount: 1,
        whatsappFallbackCount: 0,
        whatsappUnreachableCount: 0,
      },
    })
  })

  test('CA02: enviado no grupo — 200 sent_to_group', async () => {
    const response = await post(
      createFixture({ result: { attempts: 1, outcome: 'sent_to_group' } }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { attempts: 1, outcome: 'sent_to_group' } })
  })

  test('D6: não enviado é 200 skipped com o motivo, para a tela dizer por quê', async () => {
    const response = await post(
      createFixture({ result: { outcome: 'skipped', reason: 'no_template_selected' } }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { outcome: 'skipped', reason: 'no_template_selected' },
    })
  })

  test('CA05: tipo marcado pela 321 é 409 OCCURRENCE_CONTRACTOR_NOTICE_BLOCKED', async () => {
    const response = await post(createFixture({ result: { outcome: 'blocked' } }))

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CONTRACTOR_NOTICE_BLOCKED')
  })

  test('CA04: já avisada é 409 com quem avisou', async () => {
    for (const by of ['manual', 'automatic'] as const) {
      const response = await post(createFixture({ result: { by, outcome: 'already_notified' } }))

      expect(response.status).toBe(409)
      const body = (await response.json()) as {
        error: { code: string }
        notifiedBy?: string
      }
      expect(body.error.code).toBe('OCCURRENCE_CONTRACTOR_NOTICE_ALREADY_SENT')
      expect(body.notifiedBy).toBe(by)
    }
  })

  test('ocorrência de parada, sem contratante ou de outra empresa: 404', async () => {
    const response = await post(createFixture({ result: { outcome: 'not_document' } }))

    expect(response.status).toBe(404)
  })

  test('identificador que não é UUID nunca chega ao caso de uso', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: '/trip-occurrences/nao-e-uuid/contractor-notice' }),
    )

    expect(response.status).toBe(404)
    expect(fixture.calls).toEqual([])
  })
})
