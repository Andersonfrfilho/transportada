/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from './nfe-import-application.fixture'
import {
  changeRuleStatusRequest,
  CREATE_RULE_BODY,
  CREATE_RULE_IDEMPOTENCY_KEY,
  FREIGHT_CALCULATIONS_PATH,
  FREIGHT_RULES_PATH,
  FREIGHT_SIMULATION_BODY,
  FREIGHT_SIMULATIONS_PATH as FREIGHT_SIMULATIONS_ROUTE_PATH,
  FRONTEND_ORIGIN,
  freightCalculationsListRequest,
  freightRulesListRequest,
  createRuleRequest,
  responseApiError,
  SIMULATION_IDEMPOTENCY_KEY,
  simulateFreightRequest,
  UPDATE_RULE_BODY,
  updateRuleRequest,
} from './freight-http-request.fixture'
import {
  RULE_SUMMARY,
  RULES_PAGE,
  serializeCalculationDetail,
  serializeRuleSummary,
  SIMULATION_RESULT,
  SIMULATIONS_PAGE,
} from './freight-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

type FreightRuleListCall = {
  readonly context: CompanyContext
  readonly cursor: string | null
  readonly limit: number
}

type FreightCalculationListCall = {
  readonly context: CompanyContext
  readonly cursor: string | null
  readonly documentId: string
  readonly limit: number
}

type CreateRuleCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly description: string
  readonly idempotencyKey: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly name: string
  readonly percentage: string
  readonly priority: string
  readonly validFrom: string
  readonly validUntil: string | null
}

type SimulateCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly documentId: string
  readonly idempotencyKey: string
}

type ChangeRuleStatusCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly freightRuleId: string
}

type UpdateRuleCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly expectedCurrentVersion: string
  readonly filters: {
    readonly destinationStates: readonly string[]
    readonly senderTaxIds: readonly string[]
  }
  readonly freightRuleId: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly percentage: string
  readonly validFrom: string
  readonly validUntil: string | null
}

type FreightHttpRouteDependencies = {
  readonly activateRule: { execute(input: ChangeRuleStatusCall): Promise<typeof RULE_SUMMARY> }
  readonly createRule: { execute(input: CreateRuleCall): Promise<typeof RULE_SUMMARY> }
  readonly deactivateRule: { execute(input: ChangeRuleStatusCall): Promise<typeof RULE_SUMMARY> }
  readonly listCalculations: {
    execute(input: FreightCalculationListCall): Promise<typeof SIMULATIONS_PAGE>
  }
  readonly listRules: {
    execute(input: FreightRuleListCall): Promise<typeof RULES_PAGE>
  }
  readonly simulate: { execute(input: SimulateCall): Promise<typeof SIMULATION_RESULT> }
  readonly updateRule: { execute(input: UpdateRuleCall): Promise<typeof RULE_SUMMARY> }
}

type CreateFixtureParams = {
  readonly authenticationError?: Error
  readonly changeRuleStatusError?: Error
  readonly createRuleError?: Error
  readonly listCalculationsError?: Error
  readonly listRulesError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly simulationError?: Error
  readonly updateRuleError?: Error
}

export const RULES_PATH = FREIGHT_RULES_PATH
export const FREIGHT_SIMULATIONS_PATH = FREIGHT_SIMULATIONS_ROUTE_PATH
export const FREIGHT_CALCULATIONS_LIST_PATH = FREIGHT_CALCULATIONS_PATH
export const RULE_ID = RULE_SUMMARY.id
export const RULE_VERSION_VALID_FROM = CREATE_RULE_BODY.validFrom
export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['settings.manage', 'freight.simulate', 'invoices.read']),
}
export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['invoices.read']),
}

export {
  changeRuleStatusRequest,
  CREATE_RULE_BODY,
  CREATE_RULE_IDEMPOTENCY_KEY,
  FREIGHT_SIMULATION_BODY,
  FRONTEND_ORIGIN,
  freightCalculationsListRequest,
  freightRulesListRequest,
  createRuleRequest,
  responseApiError,
  RULE_SUMMARY,
  serializeCalculationDetail,
  serializeRuleSummary,
  SIMULATION_IDEMPOTENCY_KEY,
  SIMULATION_RESULT,
  simulateFreightRequest,
  UPDATE_RULE_BODY,
  updateRuleRequest,
}

export async function createFreightHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly activateRuleCalls: ChangeRuleStatusCall[]
  readonly createRuleCalls: CreateRuleCall[]
  readonly deactivateRuleCalls: ChangeRuleStatusCall[]
  readonly events: string[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalculationsCalls: FreightCalculationListCall[]
  readonly listRulesCalls: FreightRuleListCall[]
  readonly simulationCalls: SimulateCall[]
  readonly updateRuleCalls: UpdateRuleCall[]
}> {
  const activateRuleCalls: ChangeRuleStatusCall[] = []
  const createRuleCalls: CreateRuleCall[] = []
  const deactivateRuleCalls: ChangeRuleStatusCall[] = []
  const events: string[] = []
  const listCalculationsCalls: FreightCalculationListCall[] = []
  const listRulesCalls: FreightRuleListCall[] = []
  const simulationCalls: SimulateCall[] = []
  const updateRuleCalls: UpdateRuleCall[] = []
  const routes = await loadRoutes({
    activateRule: {
      async execute(input) {
        activateRuleCalls.push(structuredClone(input))
        if (params.changeRuleStatusError) throw params.changeRuleStatusError
        return RULE_SUMMARY
      },
    },
    createRule: {
      async execute(input) {
        createRuleCalls.push(structuredClone(input))
        if (params.createRuleError) throw params.createRuleError
        return RULE_SUMMARY
      },
    },
    deactivateRule: {
      async execute(input) {
        deactivateRuleCalls.push(structuredClone(input))
        if (params.changeRuleStatusError) throw params.changeRuleStatusError
        return RULE_SUMMARY
      },
    },
    listCalculations: {
      async execute(input) {
        listCalculationsCalls.push(structuredClone(input))
        if (params.listCalculationsError) throw params.listCalculationsError
        return SIMULATIONS_PAGE
      },
    },
    listRules: {
      async execute(input) {
        listRulesCalls.push(structuredClone(input))
        if (params.listRulesError) throw params.listRulesError
        return RULES_PAGE
      },
    },
    simulate: {
      async execute(input) {
        simulationCalls.push(structuredClone(input))
        if (params.simulationError) throw params.simulationError
        return SIMULATION_RESULT
      },
    },
    updateRule: {
      async execute(input) {
        updateRuleCalls.push(structuredClone(input))
        if (params.updateRuleError) throw params.updateRuleError
        return RULE_SUMMARY
      },
    },
  })

  const router = createTestRouter({
    authenticationError: params.authenticationError,
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    events,
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'freight-http-correlation',
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    activateRuleCalls,
    createRuleCalls,
    deactivateRuleCalls,
    events,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCalculationsCalls,
    listRulesCalls,
    simulationCalls,
    updateRuleCalls,
  }
}

export function unauthenticatedError(): ApiError {
  return new ApiError({
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required',
    status: 401,
  })
}

async function loadRoutes(
  input: FreightHttpRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/freight/presentation/freight.routes.js')) as {
    createFreightRoutes(dependencies: FreightHttpRouteDependencies): readonly RegisteredRoute[]
  }
  return module.createFreightRoutes(input)
}

function createTestRouter(input: {
  readonly authenticationError: Error | undefined
  readonly context: AuthenticatedContext<CompanyContext>
  readonly events: string[]
  readonly routes: readonly RegisteredRoute[]
}) {
  const authorization = new AuthorizationService()
  return createRouter({
    authentication: {
      async authenticate() {
        input.events.push('authenticate')
        if (input.authenticationError) throw input.authenticationError
        return input.context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        input.events.push('authorize')
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
    routes: input.routes,
    tenantContext: {
      async resolveCompany() {
        input.events.push('tenant')
        return input.context
      },
    },
  })
}

function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      subject: 'freight-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: {
      ...COMPANY_CONTEXT,
      permissions,
    },
  }
}
