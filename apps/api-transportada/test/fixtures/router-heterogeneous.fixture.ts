/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRouter, defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ROUTER_COMPANY_ID, ROUTER_NOW, ROUTER_USER_ID } from './router.fixture'

type HandleStringRouteParams = Readonly<{
  input: string
}>

type HandleObjectRouteParams = Readonly<{
  input: Readonly<{ readonly value: number }>
}>

export function createHeterogeneousRouterFixture() {
  const context = companyContext()
  const received: Array<string | number> = []
  const router = createRouter({
    authentication: {
      async authenticate() {
        return identity()
      },
    },
    authorization: new AuthorizationService(),
    healthService: healthService(),
    routes: [
      defineRoute({
        async handle({ input }: HandleStringRouteParams) {
          received.push(input)
          return new Response(null, { status: 204 })
        },
        method: 'POST',
        parse() {
          return 'first-input'
        },
        pathname: '/router-contract/string',
        policy: { permission: 'settings.manage', scope: 'company' },
      }),
      defineRoute({
        async handle({ input }: HandleObjectRouteParams) {
          received.push(input.value)
          return new Response(null, { status: 204 })
        },
        method: 'PUT',
        parse() {
          return Object.freeze({ value: 2 })
        },
        pathname: '/router-contract/object',
        policy: { permission: 'settings.manage', scope: 'company' },
      }),
    ],
    tenantContext: {
      async resolveCompany() {
        return context
      },
    },
  })

  return { received, router }
}

function companyContext(): AuthenticatedContext<CompanyContext> {
  return Object.freeze({
    identity: identity(),
    scope: Object.freeze({
      companyId: ROUTER_COMPANY_ID,
      kind: 'company' as const,
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions: new Set(['settings.manage'] as const),
      roles: ['company-admin'] as const,
      userId: ROUTER_USER_ID,
    }),
  })
}

function identity(): AuthenticatedIdentity {
  return Object.freeze({
    companyIdClaim: ROUTER_COMPANY_ID,
    externalIdentityId: '00000000-0000-4000-8000-000000000004',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'router-contract-user',
    userId: ROUTER_USER_ID,
  })
}

function healthService(): HealthService {
  return new HealthService({
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
    now: () => ROUTER_NOW,
  })
}
