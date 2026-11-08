/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.2 (RNF2, BOLA): a rota do robô é de uma permissão só. `trip.manage` não a alcança, e o token do robô
 * entrega com a empresa do contexto.
 */
import { describe, expect, test } from 'bun:test'

import { createDriverStopReminderRoutes } from '../../src/driver-stop-reminders/presentation/driver-stop-reminders.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import { FRONTEND_ORIGIN, jsonRequest } from '../fixtures/trip-http-payload.fixture.js'

const REMINDER_ID = '00000000-0000-4000-8000-00000000e001'
const PATH = `/driver-stop-reminders/${REMINDER_ID}/delivery`
const NEXT_DUE_AT = new Date('2026-11-07T17:30:00.000Z')

function createFixture(permissions: CompanyContext['permissions'], serviceAccount: boolean) {
  const calls: unknown[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount,
      subject: 'stop-reminder-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions },
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
    routes: createDriverStopReminderRoutes({
      reconcileDriverStopReminders: {
        execute: async (params) => {
          calls.push({ reconcile: params })
          return { openedCount: 2 }
        },
      },
      deliverDriverStopReminder: {
        execute: async (params) => {
          calls.push(params)
          return { nextDueAt: NEXT_DUE_AT, outcome: 'sent' }
        },
      },
    }),
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'stop-reminder-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

const post = (fixture: ReturnType<typeof createFixture>) =>
  fixture.handle(jsonRequest({ method: 'POST', path: PATH }))

describe('a rota do robô de lembretes é de uma permissão só (spec 299 T2.2)', () => {
  test('o token da automação entrega, com a empresa do contexto', async () => {
    const fixture = createFixture(new Set(['trip.stop-reminder-dispatch']), true)
    const response = await post(fixture)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { nextDueAt: NEXT_DUE_AT.toISOString(), outcome: 'sent' },
    })
    expect(fixture.calls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, reminderId: REMINDER_ID },
    ])
  })

  test('quem tem `trip.manage` e não tem a permissão do robô recebe 403', async () => {
    const fixture = createFixture(
      new Set(['trip.manage', 'trip.report-on-behalf', 'fleet.read']),
      false,
    )
    expect((await post(fixture)).status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('a permissão do robô com identidade que não é de serviço é recusada', async () => {
    const fixture = createFixture(new Set(['trip.stop-reminder-dispatch']), false)
    expect((await post(fixture)).status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('identificador que não é UUID não chega ao caso de uso', async () => {
    const fixture = createFixture(new Set(['trip.stop-reminder-dispatch']), true)
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: '/driver-stop-reminders/nao-e-uuid/delivery' }),
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(fixture.calls).toEqual([])
  })
})

describe('a varredura do robô é da mesma permissão (spec 299, dono 2026-11-07)', () => {
  const reconcile = (fixture: ReturnType<typeof createFixture>) =>
    fixture.handle(jsonRequest({ method: 'POST', path: '/driver-stop-reminders/reconciliation' }))

  test('o token da automação varre a empresa do contexto', async () => {
    const fixture = createFixture(new Set(['trip.stop-reminder-dispatch']), true)
    const response = await reconcile(fixture)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { openedCount: 2 } })
    expect(fixture.calls).toEqual([{ reconcile: { companyId: COMPANY_CONTEXT.companyId } }])
  })

  test('quem tem `trip.manage` e não tem a permissão do robô recebe 403', async () => {
    const fixture = createFixture(new Set(['trip.manage', 'fleet.read']), false)
    expect((await reconcile(fixture)).status).toBe(403)
    expect(fixture.calls).toEqual([])
  })
})
