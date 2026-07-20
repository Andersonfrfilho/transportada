/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HealthService } from '../../src/health/health.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { COMPANY_CONTEXT, COMPANY_ID } from './company-settings-application.fixture'

export function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return { identity: identity(), scope: { ...COMPANY_CONTEXT, permissions } }
}

function identity(): AuthenticatedIdentity {
  return {
    companyIdClaim: COMPANY_ID,
    externalIdentityId: crypto.randomUUID(),
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'digital-certificates-http-contract',
    userId: COMPANY_CONTEXT.userId,
  }
}

export function healthService(): HealthService {
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
  })
}
