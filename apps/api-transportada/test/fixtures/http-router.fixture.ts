/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
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

type CreateHttpRouterFixtureParams = {
  readonly anonymousRoutes?: readonly RegisteredAnonymousRoute[]
  readonly authentication: AuthenticationPort
  readonly healthService: HealthService
  readonly routes?: readonly RegisteredRouterRoute[]
  readonly tenantContext: TenantContextService
}

export function createHttpRouterFixture({
  anonymousRoutes = [],
  authentication,
  healthService,
  routes = [],
  tenantContext,
}: CreateHttpRouterFixtureParams): HttpRouter {
  return createRouter({
    anonymousRoutes,
    authentication,
    authorization: new AuthorizationService(),
    healthService,
    routes,
    tenantContext,
  })
}
