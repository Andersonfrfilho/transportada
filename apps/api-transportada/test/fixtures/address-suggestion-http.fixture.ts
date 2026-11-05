/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { stubUserPictureExistence } from './user-picture-existence.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import type {
  AddressCorrectionSuggestionDecisionPort,
  DecideAddressCorrectionSuggestionParams,
} from '../../src/address-correction-suggestions/application/address-correction-suggestion.port'
import { AddressCorrectionSuggestionNotFoundError } from '../../src/address-correction-suggestions/domain/address-correction-suggestion.error'
import { createAddressCorrectionSuggestionRoutes } from '../../src/address-correction-suggestions/presentation/address-correction-suggestion.routes'
import { FRONTEND_ORIGIN } from './fleet-http-payload.fixture'

export const CORRELATION_ID = 'address-suggestion-http-correlation'
export const COMPANY_ID = '00000000-0000-4000-8000-000000000931'
export const USER_ID = '00000000-0000-4000-8000-000000000932'
export const SUGGESTION_ID = '00000000-0000-4000-8000-000000000933'
export const FOREIGN_SUGGESTION_ID = '00000000-0000-4000-8000-000000000934'

type Call = DecideAddressCorrectionSuggestionParams & { readonly verb: 'apply' | 'dismiss' }

/** Só `SUGGESTION_ID` é da empresa do token: qualquer outra recebe o 404 que o repositório real dá. */
export async function createAddressSuggestionHttpFixture(
  params: { readonly permissions?: CompanyContext['permissions'] } = {},
) {
  const calls: Call[] = []
  const decide =
    (verb: Call['verb']): AddressCorrectionSuggestionDecisionPort['apply'] =>
    async (input) => {
      calls.push({ ...input, verb })
      if (input.suggestionId !== SUGGESTION_ID) throw new AddressCorrectionSuggestionNotFoundError()
      return { id: input.suggestionId, status: verb === 'apply' ? 'applied' : 'dismissed' }
    }
  const routes = createAddressCorrectionSuggestionRoutes({
    decisions: { apply: decide('apply'), dismiss: decide('dismiss') },
  })
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'address-suggestion-http-contract',
      userId: USER_ID,
    } satisfies AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000935',
      permissions: params.permissions ?? new Set(['trip.manage']),
      roles: ['operator'],
      userId: USER_ID,
    },
  }
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: {
      async authenticate() {
        return context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        authorization.authorize(value, policy)
      },
    },
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
    routes,
    tenantContext: {
      async resolveCompany() {
        return context
      },
    },
    userPictureExistence: stubUserPictureExistence(),
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
