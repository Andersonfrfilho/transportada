/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HealthService } from '../../src/health/health.service'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import type {
  CompanySettingsInput,
  CompanySettingsResult,
} from '../../src/companies/application/company-settings.port'
import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  CORRELATION_ID,
  EXPECTED_SETTINGS_RESULT,
} from './company-settings-application.fixture'
import { FRONTEND_ORIGIN } from './company-settings-http-request.fixture'

export const GENERATED_CORRELATION_ID = CORRELATION_ID
export {
  COMPANY_SETTINGS_PATH,
  FRONTEND_ORIGIN,
  getSettingsRequest,
  patchSettingsRequest,
  responseApiError,
  streamingPatchSettingsRequest,
} from './company-settings-http-request.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>
type UpdateCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly settings: CompanySettingsInput
}

type RouteDependencies = {
  readonly getSettings: {
    execute(input: { readonly context: CompanyContext }): Promise<CompanySettingsResult | null>
  }
  readonly updateSettings: {
    execute(input: UpdateCall): Promise<CompanySettingsResult>
  }
}

type CreateFixtureParams = {
  readonly getError?: Error
  readonly getResult?: CompanySettingsResult | null
  readonly permissions?: CompanyContext['permissions']
  readonly updateError?: Error
  readonly updateResult?: CompanySettingsResult
}

export async function createCompanySettingsHttpFixture({
  getError,
  getResult = EXPECTED_SETTINGS_RESULT,
  permissions = COMPANY_CONTEXT.permissions,
  updateError,
  updateResult = EXPECTED_SETTINGS_RESULT,
}: CreateFixtureParams = {}) {
  const events: string[] = []
  const getCalls: CompanyContext[] = []
  const updateCalls: UpdateCall[] = []
  const context = authenticatedContext(permissions)
  const routes = await loadRoutes({
    getSettings: createGetSettingsSpy({ error: getError, getCalls, result: getResult }),
    updateSettings: createUpdateSettingsSpy({
      error: updateError,
      result: updateResult,
      updateCalls,
    }),
  })
  const router = createTestRouter({ context, events, routes })
  const handle = createRequestHandler({
    createCorrelationId: () => GENERATED_CORRELATION_ID,
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    events,
    getCalls,
    handle: (request: Request) => handle(request, { timeout() {} }),
    updateCalls,
  }
}

function createTestRouter(input: {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly events: string[]
  readonly routes: readonly RegisteredRoute[]
}) {
  const authorization = new AuthorizationService()
  return createRouter({
    authentication: {
      async authenticate() {
        input.events.push('authenticate')
        return input.context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        input.events.push('authorize')
        authorization.authorize(value, policy)
      },
    },
    healthService: healthService(),
    routes: input.routes,
    tenantContext: {
      async resolveCompany() {
        input.events.push('tenant')
        return input.context
      },
    },
  })
}

function createGetSettingsSpy(input: {
  readonly error: Error | undefined
  readonly getCalls: CompanyContext[]
  readonly result: CompanySettingsResult | null
}): RouteDependencies['getSettings'] {
  return {
    async execute(call) {
      input.getCalls.push(call.context)
      if (input.error) throw input.error
      return input.result
    },
  }
}

function createUpdateSettingsSpy(input: {
  readonly error: Error | undefined
  readonly result: CompanySettingsResult
  readonly updateCalls: UpdateCall[]
}): RouteDependencies['updateSettings'] {
  return {
    async execute(call) {
      input.updateCalls.push(structuredClone(call))
      if (input.error) throw input.error
      return input.result
    },
  }
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/companies/presentation/company-settings.routes.js')) as {
    createCompanySettingsRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createCompanySettingsRoutes(input)
}

function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: identity(),
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}

function identity(): AuthenticatedIdentity {
  return {
    companyIdClaim: COMPANY_ID,
    externalIdentityId: crypto.randomUUID(),
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'company-settings-http-contract',
    userId: COMPANY_CONTEXT.userId,
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
  })
}
