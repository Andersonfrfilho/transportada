/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — `POST /whatsapp-command-requests/:id/settlement` é do worker e só dele: token de
 * máquina, papel `automation`, permissão `whatsapp.settle` (molde do `mdfe-auto-issue`, ADR-0047).
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter, type defineRoute } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import {
  COMPANY_ROLE_PERMISSIONS,
  type CompanyPermission,
  resolveCompanyPermissions,
} from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { SettleWhatsAppCommandInput } from '../../src/whatsapp-commands/application/settle-whatsapp-command.use-case.js'
import { createWhatsAppCommandSettlementRoutes } from '../../src/whatsapp-commands/presentation/whatsapp-command-settlement.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'

type RegisteredRoute = ReturnType<typeof defineRoute>

const COMPANY_ID = '00000000-0000-4000-8000-000000001471'
const SERVICE_USER_ID = '00000000-0000-4000-8000-000000001472'
const REQUEST_ID = '00000000-0000-4000-8000-000000001473'
const ORIGIN = 'http://127.0.0.1:53000'

function context(
  permissions: readonly CompanyPermission[],
  serviceAccount: boolean,
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000001474',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount,
      subject: 'settlement-routes',
      userId: SERVICE_USER_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000001475',
      permissions: new Set(permissions),
      roles: [serviceAccount ? 'automation' : 'company-admin'],
      userId: SERVICE_USER_ID,
    },
  }
}

function createScenario(caller: AuthenticatedContext<CompanyContext>) {
  const calls: SettleWhatsAppCommandInput[] = []
  const routes = createWhatsAppCommandSettlementRoutes({
    async settle(input) {
      calls.push(input)
      return { kind: 'waiting' }
    },
  })
  const router = createTestRouter({ context: caller, routes })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'corr-t014-routes',
    frontendOrigins: [ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    calls,
    post: (requestId: string) =>
      handleRequest(
        new Request(`${ORIGIN}/whatsapp-command-requests/${requestId}/settlement`, {
          headers: { origin: ORIGIN },
          method: 'POST',
        }),
        { timeout() {} },
      ),
  }
}

describe('whatsapp.settle é só do papel automation (spec 144 T014)', () => {
  test('nenhum papel de gente concede a permissão; automation concede', () => {
    for (const role of Object.keys(COMPANY_ROLE_PERMISSIONS)) {
      const permissions = resolveCompanyPermissions([role as never])
      expect({ granted: permissions.has('whatsapp.settle'), role }).toEqual({
        granted: role === 'automation',
        role,
      })
    }
  })

  test('a rota declara a política whatsapp.settle, escopo company', () => {
    const [route] = createWhatsAppCommandSettlementRoutes({
      settle: async () => ({ kind: 'waiting' }),
    })
    expect(route?.method).toBe('POST')
    expect(route?.pathname).toBe('/whatsapp-command-requests/:id/settlement')
    expect(route?.policy).toEqual({ permission: 'whatsapp.settle', scope: 'company' })
  })

  test('administrador da empresa, com tudo o que fatura, recebe 403 e nada é liquidado', async () => {
    const admin = resolveCompanyPermissions(['company-admin'])
    const scenario = createScenario(context([...admin], false))

    const response = await scenario.post(REQUEST_ID)

    expect(response.status).toBe(403)
    expect(scenario.calls).toEqual([])
  })

  test('o token de máquina liquida na empresa do contexto, com o correlation id', async () => {
    const scenario = createScenario(context(['mdfe.auto-issue', 'whatsapp.settle'], true))

    const response = await scenario.post(REQUEST_ID)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { outcome: 'waiting' } })
    expect(scenario.calls).toEqual([
      { companyId: COMPANY_ID, correlationId: 'corr-t014-routes', requestId: REQUEST_ID },
    ])
  })

  test('id que não é UUID é recusado antes de chegar ao caso de uso', async () => {
    const scenario = createScenario(context(['whatsapp.settle'], true))

    const response = await scenario.post('not-a-uuid')

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(scenario.calls).toEqual([])
  })
})

function createTestRouter(input: {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly routes: readonly RegisteredRoute[]
}) {
  return createRouter({
    authentication: { authenticate: async () => input.context.identity },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes: input.routes,
    tenantContext: { resolveCompany: async () => input.context },
  })
}
