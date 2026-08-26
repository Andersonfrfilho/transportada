/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { expect } from 'bun:test'

import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRouter, defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { RouteAuthorizationPolicy } from '../../src/identity/domain/authorization.policy'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'

export const ROUTER_COMPANY_ID = '00000000-0000-4000-8000-000000000001'
export const ROUTER_USER_ID = '00000000-0000-4000-8000-000000000002'
export const ROUTER_PROTECTED_PATH = '/router-contract/protected'
export const ROUTER_NOW = new Date('2026-07-20T12:00:00.000Z')

type FailAt = 'authentication' | 'authorization' | 'tenant'

type CreateRouterFixtureParams = {
  readonly failAt?: FailAt
  readonly omitPolicy?: boolean
}

type ProtectedRouteInput = Readonly<{
  accepted: true
}>

type ParseProtectedRouteParams = Readonly<{
  context: AuthenticatedContext<CompanyContext>
  request: Request
}>

type HandleProtectedRouteParams = Readonly<{
  context: AuthenticatedContext<CompanyContext>
  input: ProtectedRouteInput
}>

export function createRouterFixture({
  failAt,
  omitPolicy = false,
}: CreateRouterFixtureParams = {}) {
  const events: string[] = []
  const authorizationService = new AuthorizationService()
  const context = companyContext(failAt === 'authorization' ? [] : ['settings.manage'])
  const router = createRouter({
    authentication: {
      async authenticate() {
        events.push('authenticate')
        if (failAt === 'authentication') {
          throw new ApiError({
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            status: 401,
          })
        }
        return identity()
      },
    },
    authorization: {
      authorize(
        authenticatedContext: AuthenticatedContext<CompanyContext>,
        policy: RouteAuthorizationPolicy | undefined,
      ) {
        events.push('authorize')
        authorizationService.authorize(authenticatedContext, policy)
      },
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: healthService(),
    routes: [
      defineRoute({
        async handle({ context: routedContext, input }: HandleProtectedRouteParams) {
          events.push('handle')
          expect(routedContext).toBe(context)
          expect(input).toEqual({ accepted: true })
          return new Response(null, { status: 204 })
        },
        method: 'POST',
        async parse({ context: routedContext, request }: ParseProtectedRouteParams) {
          events.push('parse')
          expect(routedContext).toBe(context)
          expect(request.method).toBe('POST')
          expect(new URL(request.url).pathname).toBe(ROUTER_PROTECTED_PATH)
          return Object.freeze({ accepted: true as const })
        },
        pathname: ROUTER_PROTECTED_PATH,
        ...(omitPolicy
          ? {}
          : {
              policy: {
                permission: 'settings.manage',
                scope: 'company',
              } as const,
            }),
      }),
    ],
    tenantContext: {
      async resolveCompany() {
        events.push('tenant')
        if (failAt === 'tenant') {
          throw new ApiError({
            code: 'FORBIDDEN',
            message: 'Access denied',
            status: 403,
          })
        }
        return context
      },
    },
  })

  return { events, router }
}

export function routerRequest(pathname: string, method = 'POST'): Request {
  return new Request(`http://localhost${pathname}`, {
    headers: { authorization: 'Bearer header.payload.signature' },
    method,
  })
}

export async function captureRouterError(callback: () => Promise<Response>): Promise<ApiError> {
  try {
    await callback()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }

  throw new Error('Expected router to reject the request')
}

function companyContext(
  permissions: readonly ['settings.manage'] | readonly [],
): AuthenticatedContext<CompanyContext> {
  return Object.freeze({
    identity: identity(),
    scope: Object.freeze({
      companyId: ROUTER_COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions: new Set(permissions),
      roles: ['company-admin'] as const,
      userId: ROUTER_USER_ID,
    }),
  })
}

function identity(): AuthenticatedIdentity {
  return Object.freeze({
    companyIdClaim: ROUTER_COMPANY_ID,
    externalIdentityId: '00000000-0000-4000-8000-000000000004',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    serviceAccount: false,
    subject: 'router-contract-user',
    userId: ROUTER_USER_ID,
  })
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
    now: () => ROUTER_NOW,
  })
}
