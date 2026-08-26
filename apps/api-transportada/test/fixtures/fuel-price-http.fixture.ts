/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As rotas de preço de combustível sobre o roteador real. Os casos de uso são falsos, mas guardam o
 * ajuste numa tabela em memória e resolvem o preço efetivo pela política de verdade — é assim que o
 * `DELETE` seguido de `GET` consegue provar que aquele produto voltou para a ANP e os outros não se
 * mexeram.
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
  resolveEffectiveFuelPrices,
  type EffectiveFuelPrice,
  type EnergyTariff,
  type FuelPriceAdjustmentRow,
  type FuelPriceReferenceRow,
} from '../../src/companies/domain/fuel-price.policy'
import type { FuelProduct } from '../../src/shared/fuel.constant'
import { COMPANY_CONTEXT, COMPANY_ID, CORRELATION_ID } from './company-settings-application.fixture'
import { FRONTEND_ORIGIN } from './company-settings-http-request.fixture'

export { COMPANY_ID, FRONTEND_ORIGIN }

export const FUEL_PRICES_PATH = '/company-settings/fuel-prices'
export const GENERATED_CORRELATION_ID = CORRELATION_ID
export const COMPANY_STATE = 'SP'
export const REFERENCE_WEEK_ENDING_ON = '2026-08-08'
export const ADJUSTED_AT = new Date('2026-08-12T13:45:00.000Z')

/** Referência da ANP para quatro dos cinco produtos: o GNV entra sem preço nenhum de propósito. */
export const REFERENCES: readonly FuelPriceReferenceRow[] = [
  reference('diesel-s10', '6.1230'),
  reference('diesel-s500', '5.9870'),
  reference('gasolina-comum', '6.4410'),
  reference('etanol-hidratado', '4.2100'),
]

export const ADJUSTMENTS: readonly FuelPriceAdjustmentRow[] = [
  { pricePerUnit: '5.8000', product: 'diesel-s10', updatedAt: ADJUSTED_AT },
]

/** Linha vigente da CERAÇÁ medida na ANEEL em 21/08/2026, B3 · Convencional, em R$/MWh. */
export const ENERGY_TARIFF: EnergyTariff = {
  adjustmentFactor: '1.0000',
  distributorCode: 'CERACA',
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-09-29',
  tePerMegawattHour: '227.7000',
  tusdPerMegawattHour: '567.8000',
}

type AdjustCall = {
  readonly companyId: string
  readonly pricePerUnit: string
  readonly product: FuelProduct
}

type ClearCall = {
  readonly companyId: string
  readonly product: FuelProduct
}

type RegisteredRoute = ReturnType<typeof defineRoute>

type RouteDependencies = {
  readonly adjust: {
    execute(input: AdjustCall): Promise<EffectiveFuelPrice>
  }
  readonly clear: {
    execute(input: ClearCall): Promise<void>
  }
  readonly list: {
    execute(input: { readonly companyId: string }): Promise<readonly EffectiveFuelPrice[]>
  }
}

type CreateFixtureParams = {
  readonly adjustments?: readonly FuelPriceAdjustmentRow[]
  readonly energy?: EnergyTariff | null
  readonly listError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly references?: readonly FuelPriceReferenceRow[]
}

export async function createFuelPriceHttpFixture({
  adjustments = ADJUSTMENTS,
  energy = ENERGY_TARIFF,
  listError,
  permissions = COMPANY_CONTEXT.permissions,
  references = REFERENCES,
}: CreateFixtureParams = {}) {
  const adjustCalls: AdjustCall[] = []
  const clearCalls: ClearCall[] = []
  const events: string[] = []
  const listCalls: string[] = []
  const logs: Array<Record<string, unknown>> = []
  const store = new Map(adjustments.map((row) => [row.product, row]))
  const resolve = (): readonly EffectiveFuelPrice[] =>
    resolveEffectiveFuelPrices({
      adjustments: [...store.values()],
      energy,
      references,
      state: COMPANY_STATE,
    })
  const entryOf = (product: FuelProduct): EffectiveFuelPrice => {
    const entry = resolve().find((candidate) => candidate.product === product)
    if (entry === undefined) throw new Error(`product outside the catalog reached the use case`)
    return entry
  }
  const routes = await loadRoutes({
    adjust: {
      async execute(call) {
        adjustCalls.push(call)
        store.set(call.product, {
          pricePerUnit: call.pricePerUnit,
          product: call.product,
          updatedAt: ADJUSTED_AT,
        })
        return entryOf(call.product)
      },
    },
    clear: {
      async execute(call) {
        clearCalls.push(call)
        store.delete(call.product)
      },
    },
    list: {
      async execute(call) {
        listCalls.push(call.companyId)
        if (listError) throw listError
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
    adjustCalls,
    clearCalls,
    events,
    handle: (request: Request) => handle(request, { timeout() {} }),
    listCalls,
    logs,
  }
}

export function listPricesRequest(params: { readonly origin?: string } = {}): Request {
  return new Request(`http://localhost${FUEL_PRICES_PATH}`, {
    headers: {
      authorization: 'Bearer header.payload.signature',
      ...(params.origin ? { origin: params.origin } : {}),
    },
  })
}

export function adjustPriceRequest(params: {
  readonly body?: unknown
  readonly product: string
}): Request {
  const body = params.body ?? { pricePerUnit: '6.5000' }
  return new Request(`http://localhost${FUEL_PRICES_PATH}/${params.product}`, {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      authorization: 'Bearer header.payload.signature',
      'content-type': 'application/json',
    },
    method: 'PUT',
  })
}

export function clearPriceRequest(product: string): Request {
  return new Request(`http://localhost${FUEL_PRICES_PATH}/${product}`, {
    headers: { authorization: 'Bearer header.payload.signature' },
    method: 'DELETE',
  })
}

function reference(product: FuelProduct, pricePerUnit: string): FuelPriceReferenceRow {
  return { pricePerUnit, product, state: COMPANY_STATE, weekEndingOn: REFERENCE_WEEK_ENDING_ON }
}

async function loadRoutes(dependencies: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/companies/presentation/fuel-price.routes.js')) as {
    createFuelPriceRoutes(input: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createFuelPriceRoutes(dependencies)
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
      subject: 'fuel-price-http-contract',
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
