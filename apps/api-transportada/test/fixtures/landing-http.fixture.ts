/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import {
  API_COMPANY_SETTINGS_LANDING_PATH,
  API_PUBLIC_LANDING_SETTINGS_PATH,
} from '../../src/shared/api.constant'
import type { CompanyGroupRepositoryPort } from '../../src/landing/application/company-group.port'
import type {
  LandingSettingsRecord,
  LandingSettingsRepositoryPort,
  LandingSettingsWriteInput,
} from '../../src/landing/application/landing-settings.port'
import { createLandingSettingsUseCase } from '../../src/landing/application/landing-settings.use-case'
import { createLandingPublicRoutes, createLandingSettingsRoutes } from '../../src/landing/presentation/landing.routes'
import { COMPANY_CONTEXT, COMPANY_ID, CORRELATION_ID } from './company-settings-application.fixture'
import { FRONTEND_ORIGIN } from './company-settings-http-request.fixture'

export { FRONTEND_ORIGIN }
export const LANDING_PUBLIC_PATH = API_PUBLIC_LANDING_SETTINGS_PATH
export const LANDING_SETTINGS_PATH = API_COMPANY_SETTINGS_LANDING_PATH

export class CompanyGroupRepositoryFixture implements CompanyGroupRepositoryPort {
  public units: readonly {
    readonly city: string
    readonly cnpj: string
    readonly companyId: string
    readonly complement: string
    readonly district: string
    readonly number: string
    readonly phone: string
    readonly postalCode: string
    readonly state: string
    readonly street: string
    readonly tradeName: string
  }[] = []

  public async listGroupUnits() {
    return this.units
  }
}

export class LandingSettingsRepositoryFixture implements LandingSettingsRepositoryPort {
  public readonly upsertCalls: LandingSettingsWriteInput[] = []
  public stored: LandingSettingsRecord | null = null

  public async findByRoot() {
    return this.stored
  }

  public async upsert(input: LandingSettingsWriteInput): Promise<LandingSettingsRecord> {
    this.upsertCalls.push(input)
    this.stored = {
      accentColor: input.accentColor,
      brandName: input.brandName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      sections: input.sections,
      updatedAt: new Date('2026-08-25T12:00:00.000Z'),
    }
    return this.stored
  }
}

export function landingRequest(input: {
  readonly authenticated?: boolean
  readonly body?: string
  readonly method: string
  readonly pathname: string
}): Request {
  return new Request(`http://localhost:53001${input.pathname}`, {
    body: input.body ?? null,
    headers: {
      ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(input.authenticated === false ? {} : { authorization: 'Bearer landing-contract' }),
    },
    method: input.method,
  })
}

type CreateFixtureParams = {
  readonly permissions?: CompanyContext['permissions']
}

export async function createLandingHttpFixture({
  permissions = COMPANY_CONTEXT.permissions,
}: CreateFixtureParams = {}) {
  const companyGroupRepository = new CompanyGroupRepositoryFixture()
  const landingSettingsRepository = new LandingSettingsRepositoryFixture()
  const landingSettings = createLandingSettingsUseCase({
    companyGroupRepository,
    landingCompanyId: COMPANY_ID,
    landingSettingsRepository,
  })

  const context = authenticatedContext(permissions)
  const authorization = new AuthorizationService()
  const router = createRouter({
    anonymousRoutes: createLandingPublicRoutes({ landingSettings }),
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
    healthService: healthService(),
    routes: createLandingSettingsRoutes({ landingSettings }),
    tenantContext: {
      async resolveCompany() {
        return context
      },
    },
  })
  const handle = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    companyGroupRepository,
    handle: (request: Request) => handle(request, { timeout() {} }),
    landingSettingsRepository,
  }
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
      subject: 'landing-contract',
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
