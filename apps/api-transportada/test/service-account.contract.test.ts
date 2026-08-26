/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TenantContextService } from '../src/identity/application/tenant-context.service'
import { defineRoute } from '../src/http/router.service'
import { HealthService } from '../src/health/health.service'
import type { AuthenticationPort } from '../src/identity/application/identity.port'
import { createHttpRouterFixture } from './fixtures/http-router.fixture'

const SERVICE_COMPANY = '00000000-0000-4000-8000-0000000000aa'
const CLAIM_COMPANY = '00000000-0000-4000-8000-0000000000bb'

/**
 * ADR-0047 §3: o cabeçalho da empresa é o transporte do tenant **do serviço**, e só dele. Se ele
 * valesse para gente, qualquer usuário autenticado atravessaria para outra empresa com um `curl` —
 * que é exatamente o que o `security.md` §2 proíbe.
 */
describe('service account routing contract', () => {
  test('the company header steers a service token and is ignored for a human one', async () => {
    const seen: string[] = []
    const routes = [
      defineRoute<Record<string, never>>({
        async handle({ context }) {
          seen.push(context.scope.companyId)
          return new Response('{}', { status: 200 })
        },
        method: 'GET',
        parse: () => ({}),
        pathname: '/probe',
        policy: { permission: 'fleet.read', scope: 'company' },
      }),
    ]

    for (const serviceAccount of [true, false]) {
      const router = createHttpRouterFixture({
        authentication: identity(serviceAccount),
        healthService: healthService(),
        routes,
        tenantContext: new TenantContextService({
          repository: {
            async findActiveByUserAndCompany() {
              return { membershipId: '00000000-0000-4000-8000-000000000004', roles: ['company-admin'] }
            },
          },
        }),
      })

      const response = await router.handle({
        correlationId: 'contract-correlation-id',
        method: 'GET',
        pathname: '/probe',
        request: new Request('http://localhost/probe', {
          headers: { authorization: 'Bearer token', 'x-company-id': SERVICE_COMPANY },
        }),
      })
      expect(response.status).toBe(200)
    }

    expect(seen).toEqual([SERVICE_COMPANY, CLAIM_COMPANY])
  })
})

function identity(serviceAccount: boolean): AuthenticationPort {
  return {
    async authenticate() {
      return {
        companyIdClaim: serviceAccount ? null : CLAIM_COMPANY,
        externalIdentityId: '00000000-0000-4000-8000-000000000002',
        issuer: 'http://localhost:58080/realms/transportada-local',
        platformAdmin: false,
        serviceAccount,
        subject: 'contract-user',
        userId: '00000000-0000-4000-8000-000000000003',
      }
    },
  }
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
    migrationStatus: {
      async countPending() {
        return 0
      },
    },
  })
}
