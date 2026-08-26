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
  API_AGGREGATE_APPLICATIONS_PATH,
  API_PUBLIC_AGGREGATE_APPLICATIONS_PATH,
} from '../../src/shared/api.constant'
import { createAggregateApplicationsUseCase } from '../../src/fleet/application/aggregate-applications.use-case'
import {
  createAggregateApplicationPublicRoutes,
  createAggregateApplicationRoutes,
} from '../../src/fleet/presentation/aggregate-application.routes'
import { CompanyGroupRepositoryFixture } from './landing-http.fixture'
import { FakeAggregateApplicationRepository } from './aggregate-applications.fixture'
import { COMPANY_CONTEXT, COMPANY_ID, CORRELATION_ID } from './company-settings-application.fixture'
import { FRONTEND_ORIGIN } from './company-settings-http-request.fixture'

export { FRONTEND_ORIGIN }
export const AGGREGATE_APPLICATIONS_PATH = API_AGGREGATE_APPLICATIONS_PATH
export const PUBLIC_AGGREGATE_APPLICATIONS_PATH = API_PUBLIC_AGGREGATE_APPLICATIONS_PATH

export function aggregateApplicationRequest(input: {
  readonly authenticated?: boolean
  readonly body?: string
  readonly clientIp?: string
  readonly method: string
  readonly pathname: string
}): Request {
  return new Request(`http://localhost:53001${input.pathname}`, {
    body: input.body ?? null,
    headers: {
      ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(input.authenticated === false
        ? {}
        : { authorization: 'Bearer aggregate-application-contract' }),
      ...(input.clientIp === undefined ? {} : { 'x-forwarded-for': input.clientIp }),
    },
    method: input.method,
  })
}

type CreateFixtureParams = {
  readonly permissions?: CompanyContext['permissions']
  readonly turnstileSecretKey?: string
  readonly verifyTurnstileToken?: Parameters<
    typeof createAggregateApplicationPublicRoutes
  >[0]['verifyTurnstileToken']
}

export async function createAggregateApplicationHttpFixture({
  permissions = new Set(['fleet.manage']),
  turnstileSecretKey,
  verifyTurnstileToken,
}: CreateFixtureParams = {}) {
  const companyGroupRepository = new CompanyGroupRepositoryFixture()
  companyGroupRepository.units = [
    {
      city: 'São Paulo',
      cnpj: '12345678000195',
      companyId: COMPANY_ID,
      complement: '',
      district: 'Centro',
      number: '100',
      phone: '11999999999',
      postalCode: '01000000',
      state: 'SP',
      street: 'Rua Um',
      tradeName: 'Sede',
    },
  ]
  const repository = new FakeAggregateApplicationRepository()
  const aggregateApplications = createAggregateApplicationsUseCase({
    companyGroupRepository,
    landingCompanyId: COMPANY_ID,
    repository,
  })

  const context = authenticatedContext(permissions)
  const authorization = new AuthorizationService()
  const router = createRouter({
    anonymousRoutes: createAggregateApplicationPublicRoutes({
      aggregateApplications,
      ...(turnstileSecretKey === undefined ? {} : { turnstileSecretKey }),
      ...(verifyTurnstileToken === undefined ? {} : { verifyTurnstileToken }),
    }),
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
    routes: createAggregateApplicationRoutes({ aggregateApplications }),
    tenantContext: {
      async resolveCompany() {
        return context
      },
    },
  })
  const handle = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    handle: (request: Request) => handle(request, { timeout() {} }),
    repository,
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
      subject: 'aggregate-application-contract',
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
