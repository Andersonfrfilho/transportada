/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { HealthService } from '../../src/health/health.service'
import { createRouter, type HttpRouter } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticationPort } from '../../src/identity/application/identity.port'
import type { TenantContextService } from '../../src/identity/application/tenant-context.service'

type CreateHttpRouterFixtureParams = {
  readonly authentication: AuthenticationPort
  readonly healthService: HealthService
  readonly tenantContext: TenantContextService
}

export function createHttpRouterFixture({
  authentication,
  healthService,
  tenantContext,
}: CreateHttpRouterFixtureParams): HttpRouter {
  return createRouter({
    authentication,
    authorization: new AuthorizationService(),
    healthService,
    routes: [],
    tenantContext,
  })
}
