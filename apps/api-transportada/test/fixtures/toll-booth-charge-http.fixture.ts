/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As rotas de correção de tarifa de pedágio sobre o roteador real. Os casos de uso são falsos, mas
 * guardam o ajuste numa tabela em memória e resolvem o valor efetivo pela política de verdade — o
 * mesmo molde de `fuel-price-http.fixture.ts`.
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
  resolveEffectiveTollBoothCharge,
  type EffectiveTollBoothCharge,
  type TollBoothCatalogEntry,
  type TollBoothChargeAdjustmentRow,
} from '../../src/companies/domain/toll-booth-charge.policy'
import { COMPANY_CONTEXT, COMPANY_ID, CORRELATION_ID } from './company-settings-application.fixture'
import { FRONTEND_ORIGIN } from './company-settings-http-request.fixture'

export { COMPANY_ID, FRONTEND_ORIGIN }

export const TOLL_BOOTH_CHARGES_PATH = '/company-settings/toll-booth-charges'
export const GENERATED_CORRELATION_ID = CORRELATION_ID
export const ACTOR_USER_ID = COMPANY_CONTEXT.userId
export const UPDATED_AT = new Date('2026-09-07T13:00:00.000Z')

export const CATALOG: readonly TollBoothCatalogEntry[] = [
  {
    chargeCar: '10.50',
    chargePerAxle: '10.50',
    name: 'Praça SP-330',
    observedOn: '2026-06-01',
    operator: 'CCR',
    osmNodeId: 111,
  },
  {
    chargeCar: null,
    chargePerAxle: null,
    name: 'Praça SP-291',
    observedOn: '2026-06-01',
    operator: null,
    osmNodeId: 222,
  },
]

export const ADJUSTMENTS: readonly TollBoothChargeAdjustmentRow[] = [
  {
    actorUserId: ACTOR_USER_ID,
    chargeCar: '11.00',
    chargePerAxle: '11.00',
    observedOn: '2026-08-01',
    osmNodeId: 111,
    updatedAt: UPDATED_AT,
  },
]

type AdjustCall = {
  readonly actorUserId: string
  readonly chargeCar: null | string
  readonly chargePerAxle: null | string
  readonly companyId: string
  readonly observedOn: string
  readonly osmNodeId: number
}

type ClearCall = {
  readonly companyId: string
  readonly osmNodeId: number
}

type RegisteredRoute = ReturnType<typeof defineRoute>

type RouteDependencies = {
  readonly adjust: { execute(input: AdjustCall): Promise<EffectiveTollBoothCharge> }
  readonly clear: { execute(input: ClearCall): Promise<void> }
  readonly list: {
    execute(input: { readonly companyId: string }): Promise<readonly EffectiveTollBoothCharge[]>
  }
}

type CreateFixtureParams = {
  readonly adjustments?: readonly TollBoothChargeAdjustmentRow[]
  readonly catalog?: readonly TollBoothCatalogEntry[]
  readonly permissions?: CompanyContext['permissions']
}

export async function createTollBoothChargeHttpFixture({
  adjustments = ADJUSTMENTS,
  catalog = CATALOG,
  permissions = COMPANY_CONTEXT.permissions,
}: CreateFixtureParams = {}) {
  const adjustCalls: AdjustCall[] = []
  const clearCalls: ClearCall[] = []
  const events: string[] = []
  const listCalls: string[] = []
  const store = new Map(adjustments.map((row) => [row.osmNodeId, row]))
  const catalogByNode = new Map(catalog.map((entry) => [entry.osmNodeId, entry]))

  const resolve = (): readonly EffectiveTollBoothCharge[] =>
    [...store.values()]
      .map((adjustment) => {
        const catalogEntry = catalogByNode.get(adjustment.osmNodeId)
        if (catalogEntry === undefined) return null
        return resolveEffectiveTollBoothCharge({ adjustment, catalog: catalogEntry })
      })
      .filter((entry): entry is EffectiveTollBoothCharge => entry !== null)

  const routes = await loadRoutes({
    adjust: {
      async execute(call) {
        adjustCalls.push(call)
        store.set(call.osmNodeId, {
          actorUserId: call.actorUserId,
          chargeCar: call.chargeCar,
          chargePerAxle: call.chargePerAxle,
          observedOn: call.observedOn,
          osmNodeId: call.osmNodeId,
          updatedAt: UPDATED_AT,
        })
        const catalogEntry = catalogByNode.get(call.osmNodeId)
        if (catalogEntry === undefined) throw new Error('unknown toll booth in fixture')
        return resolveEffectiveTollBoothCharge({
          adjustment: store.get(call.osmNodeId) ?? null,
          catalog: catalogEntry,
        })
      },
    },
    clear: {
      async execute(call) {
        clearCalls.push(call)
        store.delete(call.osmNodeId)
      },
    },
    list: {
      async execute(call) {
        listCalls.push(call.companyId)
        return resolve()
      },
    },
  })
  const handle = createRequestHandler({
    createCorrelationId: () => GENERATED_CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: {
      error() {},
      info() {},
      warn() {},
    },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(permissions), events, routes }),
  })
  return {
    adjustCalls,
    clearCalls,
    events,
    handle: (request: Request) => handle(request, { timeout() {} }),
    listCalls,
  }
}

export function listChargesRequest(params: { readonly origin?: string } = {}): Request {
  return new Request(`http://localhost${TOLL_BOOTH_CHARGES_PATH}`, {
    headers: {
      authorization: 'Bearer header.payload.signature',
      ...(params.origin ? { origin: params.origin } : {}),
    },
  })
}

export function adjustChargeRequest(params: {
  readonly body?: unknown
  readonly osmNodeId: string
}): Request {
  const body = params.body ?? { chargePerAxle: '12.5000', observedOn: '2026-09-07' }
  return new Request(`http://localhost${TOLL_BOOTH_CHARGES_PATH}/${params.osmNodeId}`, {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      authorization: 'Bearer header.payload.signature',
      'content-type': 'application/json',
    },
    method: 'PUT',
  })
}

export function clearChargeRequest(osmNodeId: string): Request {
  return new Request(`http://localhost${TOLL_BOOTH_CHARGES_PATH}/${osmNodeId}`, {
    headers: { authorization: 'Bearer header.payload.signature' },
    method: 'DELETE',
  })
}

async function loadRoutes(dependencies: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/companies/presentation/toll-booth-charge.routes.js')) as {
    createTollBoothChargeRoutes(input: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createTollBoothChargeRoutes(dependencies)
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
      subject: 'toll-booth-charge-http-contract',
      userId: ACTOR_USER_ID,
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
