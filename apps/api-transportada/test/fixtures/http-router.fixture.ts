/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyFiscalEnvironmentPort } from '../../src/companies/application/company-fiscal-environment.port'
import type { HealthService } from '../../src/health/health.service'
import {
  createRouter,
  type HttpRouter,
  type RegisteredAnonymousRoute,
  type RegisteredRouterRoute,
} from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticationPort } from '../../src/identity/application/identity.port'
import type { TenantContextService } from '../../src/identity/application/tenant-context.service'
import type { UserPictureExistencePort } from '../../src/identity/application/user-picture.port'
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { stubUserPictureExistence } from './user-picture-existence.fixture'

type CreateHttpRouterFixtureParams = {
  readonly anonymousRoutes?: readonly RegisteredAnonymousRoute[]
  readonly authentication: AuthenticationPort
  readonly companyFiscalEnvironment?: CompanyFiscalEnvironmentPort
  readonly healthService: HealthService
  readonly routes?: readonly RegisteredRouterRoute[]
  readonly tenantContext: TenantContextService
  readonly userPictureExistence?: UserPictureExistencePort
}

export function createHttpRouterFixture({
  anonymousRoutes = [],
  authentication,
  companyFiscalEnvironment = stubCompanyFiscalEnvironment(),
  healthService,
  routes = [],
  tenantContext,
  userPictureExistence = stubUserPictureExistence(),
}: CreateHttpRouterFixtureParams): HttpRouter {
  return createRouter({
    anonymousRoutes,
    authentication,
    authorization: new AuthorizationService(),
    companyFiscalEnvironment,
    healthService,
    routes,
    tenantContext,
    userPictureExistence,
  })
}
