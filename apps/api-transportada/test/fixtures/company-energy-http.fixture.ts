/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As rotas da escolha de distribuidora sobre o roteador real. Os casos de uso são falsos, mas
 * guardam a escolha em memória e resolvem a resposta pela política de verdade — é assim que o
 * `DELETE` seguido de `GET` prova que a lista continua de pé e só a escolha caiu.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import {
  resolveCompanyEnergySettings,
  type CompanyEnergyChoice,
  type CompanyEnergySettings,
  type EnergyDistributor,
} from '../../src/companies/domain/company-energy.policy'
import { companyEnergyDistributorUnknown } from '../../src/companies/domain/company-energy.error'
import { COMPANY_CONTEXT, COMPANY_ID, CORRELATION_ID } from './company-settings-application.fixture'
import { FRONTEND_ORIGIN } from './company-settings-http-request.fixture'

export { COMPANY_ID, FRONTEND_ORIGIN }

export const ENERGY_PATH = '/company-settings/energy'
export const GENERATED_CORRELATION_ID = CORRELATION_ID

export const CERACA: EnergyDistributor = { code: 'CERACA', taxId: '12345678000195' }
export const CPFL: EnergyDistributor = { code: 'CPFL-PAULISTA', taxId: '33050196000188' }
export const CATALOG: readonly EnergyDistributor[] = [CERACA, CPFL]

type ChooseCall = {
  readonly adjustmentFactor: string
  readonly companyId: string
  readonly distributorCode: string
}

type RegisteredRoute = ReturnType<typeof defineRoute>

type RouteDependencies = {
  readonly choose: { execute(input: ChooseCall): Promise<CompanyEnergySettings> }
  readonly clear: { execute(input: { readonly companyId: string }): Promise<void> }
  readonly getSettings: {
    execute(input: { readonly companyId: string }): Promise<CompanyEnergySettings>
  }
}

type CreateFixtureParams = {
  readonly catalog?: readonly EnergyDistributor[]
  readonly choice?: CompanyEnergyChoice
  readonly permissions?: CompanyContext['permissions']
  readonly readError?: Error
}

export async function createCompanyEnergyHttpFixture({
  catalog = CATALOG,
  choice = null,
  permissions = COMPANY_CONTEXT.permissions,
  readError,
}: CreateFixtureParams = {}) {
  const chooseCalls: ChooseCall[] = []
  const clearCalls: string[] = []
  const events: string[] = []
  const logs: Array<Record<string, unknown>> = []
  const readCalls: string[] = []
  let saved: CompanyEnergyChoice = choice
  const resolve = (): CompanyEnergySettings =>
    resolveCompanyEnergySettings({ catalog, choice: saved })
  const routes = await loadRoutes({
    choose: {
      async execute(call) {
        chooseCalls.push(call)
        if (!catalog.some((distributor) => distributor.code === call.distributorCode))
          throw companyEnergyDistributorUnknown()
        saved = {
          adjustmentFactor: call.adjustmentFactor,
          distributorCode: call.distributorCode,
        }
        return resolve()
      },
    },
    clear: {
      async execute(call) {
        clearCalls.push(call.companyId)
        saved = null
      },
    },
    getSettings: {
      async execute(call) {
        readCalls.push(call.companyId)
        if (readError) throw readError
        return resolve()
      },
    },
  })
  const handle = createRequestHandler({
    createCorrelationId: () => GENERATED_CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: {
      error() {},
      info(_message, metadata) {
        logs.push(metadata ?? {})
      },
      warn() {},
    },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(permissions), events, routes }),
  })
  return {
    chooseCalls,
    clearCalls,
    events,
    handle: (request: Request) => handle(request, { timeout() {} }),
    logs,
    readCalls,
  }
}

export function readEnergyRequest(params: { readonly origin?: string } = {}): Request {
  return new Request(`http://localhost${ENERGY_PATH}`, {
    headers: {
      authorization: 'Bearer header.payload.signature',
      ...(params.origin ? { origin: params.origin } : {}),
    },
  })
}

export function chooseDistributorRequest(body: unknown): Request {
  return new Request(`http://localhost${ENERGY_PATH}`, {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      authorization: 'Bearer header.payload.signature',
      'content-type': 'application/json',
    },
    method: 'PUT',
  })
}

export function clearDistributorRequest(): Request {
  return new Request(`http://localhost${ENERGY_PATH}`, {
    headers: { authorization: 'Bearer header.payload.signature' },
    method: 'DELETE',
  })
}

async function loadRoutes(dependencies: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/companies/presentation/company-energy.routes.js')) as {
    createCompanyEnergyRoutes(input: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createCompanyEnergyRoutes(dependencies)
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
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
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

function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'company-energy-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
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
    migrationStatus: appliedMigrations(),
  })
}
