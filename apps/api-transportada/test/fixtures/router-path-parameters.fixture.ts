/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import { HealthService } from '../../src/health/health.service'
import { createRouter, defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { RouteAuthorizationPolicy } from '../../src/identity/domain/authorization.policy'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'

export const ROUTER_PATH_COMPANY_ID = '00000000-0000-4000-8000-000000000101'
export const ROUTER_PATH_USER_ID = '00000000-0000-4000-8000-000000000102'
export const ROUTER_DOCUMENT_ID = '0c9e3e38-c9d0-4ef8-8a42-6dc75453e486'
export const ROUTER_DOCUMENT_PATH = `/nfe-documents/${ROUTER_DOCUMENT_ID}`
export const ROUTER_DOCUMENT_ROUTE_PATH = '/nfe-documents/:id'
export const ROUTER_EXACT_ID = 'b837c876-0e24-46b7-9304-b87f34632161'
export const ROUTER_EXACT_PATH = `/nfe-documents/${ROUTER_EXACT_ID}`

export type RouterPathParameters = Readonly<Record<string, string>>

type DynamicRouteParserParams = Readonly<{
  readonly context: AuthenticatedContext<CompanyContext>
  readonly correlationId: string
  readonly pathParameters: RouterPathParameters
  readonly request: Request
}>

type DynamicRouteHandlerParams<TInput> = Readonly<{
  readonly context: AuthenticatedContext<CompanyContext>
  readonly input: TInput
}>

type DynamicRoute<TInput> = Readonly<{
  readonly handle: (params: DynamicRouteHandlerParams<TInput>) => Promise<Response>
  readonly method: string
  readonly parse: (params: DynamicRouteParserParams) => TInput | Promise<TInput>
  readonly pathname: string
  readonly policy: RouteAuthorizationPolicy
}>

type CreateRouterPathParametersFixtureParams = Readonly<{
  readonly dynamicFirst?: boolean
  readonly dynamicPathname?: string
  readonly failAt?: 'authentication' | 'authorization' | 'tenant'
  readonly method?: string
}>

export function createRouterPathParametersFixture({
  dynamicFirst = false,
  dynamicPathname = ROUTER_DOCUMENT_ROUTE_PATH,
  failAt,
  method = 'GET',
}: CreateRouterPathParametersFixtureParams = {}) {
  const events: string[] = []
  const context = companyContext()
  const dynamicRoute = defineDynamicRoute<RouterPathParameters>({
    async handle({ context: routedContext, input }) {
      events.push('dynamic-handle')
      expect(routedContext).toBe(context)
      expect(Object.isFrozen(input)).toBe(true)
      expect(input.id).toBe(ROUTER_DOCUMENT_ID)
      return Response.json({ route: 'dynamic', id: input.id })
    },
    method,
    parse({ context: routedContext, pathParameters, request }) {
      events.push('dynamic-parse')
      expect(routedContext).toBe(context)
      expect(Object.isFrozen(pathParameters)).toBe(true)
      expect(new URL(request.url).pathname).toStartWith('/nfe-documents/')
      return pathParameters
    },
    pathname: dynamicPathname,
    policy: documentReadPolicy(),
  })
  const exactRoute = defineRoute({
    async handle() {
      events.push('exact-handle')
      return Response.json({ route: 'exact' })
    },
    method: 'GET',
    parse() {
      events.push('exact-parse')
      return Object.freeze({})
    },
    pathname: ROUTER_EXACT_PATH,
    policy: documentReadPolicy(),
  })
  const routes = dynamicFirst ? [dynamicRoute, exactRoute] : [exactRoute, dynamicRoute]
  const router = createRouter({
    authentication: {
      async authenticate() {
        events.push('authenticate')
        if (failAt === 'authentication') {
          throw new ApiError({ code: 'UNAUTHORIZED', message: 'Unauthorized', status: 401 })
        }
        return identity()
      },
    },
    authorization: {
      authorize(routedContext, policy) {
        events.push('authorize')
        if (failAt === 'authorization') {
          throw new ApiError({ code: 'FORBIDDEN', message: 'Forbidden', status: 403 })
        }
        new AuthorizationService().authorize(routedContext, policy)
      },
    },
    healthService: healthService(),
    routes,
    tenantContext: {
      async resolveCompany() {
        events.push('tenant')
        if (failAt === 'tenant') {
          throw new ApiError({ code: 'FORBIDDEN', message: 'Forbidden', status: 403 })
        }
        return context
      },
    },
  })

  return { context, events, router }
}

export function routerPathRequest(pathname: string, method = 'GET', body?: string): Request {
  return new Request(`http://localhost${pathname}`, {
    body,
    headers: { authorization: 'Bearer header.payload.signature' },
    method,
  })
}

export async function capturePathRouterError(callback: () => Promise<Response>): Promise<ApiError> {
  try {
    await callback()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }

  throw new Error('Expected router to reject the request')
}

function defineDynamicRoute<TInput>(route: DynamicRoute<TInput>) {
  return defineRoute({
    handle: route.handle,
    method: route.method,
    parse(params) {
      return route.parse({
        context: params.context,
        correlationId: params.correlationId,
        pathParameters: readPathParameters(params),
        request: params.request,
      })
    },
    pathname: route.pathname,
    policy: route.policy,
  })
}

function readPathParameters(value: unknown): RouterPathParameters {
  if (!isReadonlyRecord(value)) {
    throw new Error('Router parser params are invalid')
  }

  const pathParameters = value.pathParameters
  if (!isReadonlyStringRecord(pathParameters)) {
    throw new Error('Router path parameters are missing')
  }

  return pathParameters
}

function isReadonlyRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReadonlyStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isReadonlyRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function documentReadPolicy(): RouteAuthorizationPolicy {
  return { permission: 'invoices.read', scope: 'company' }
}

function companyContext(): AuthenticatedContext<CompanyContext> {
  return Object.freeze({
    identity: identity(),
    scope: Object.freeze({
      companyId: ROUTER_PATH_COMPANY_ID,
      kind: 'company' as const,
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['invoices.read'] as const),
      roles: ['company-admin'] as const,
      userId: ROUTER_PATH_USER_ID,
    }),
  })
}

function identity(): AuthenticatedIdentity {
  return Object.freeze({
    companyIdClaim: ROUTER_PATH_COMPANY_ID,
    externalIdentityId: '00000000-0000-4000-8000-000000000104',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'router-path-parameters-user',
    userId: ROUTER_PATH_USER_ID,
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
    now: () => new Date('2026-07-20T12:00:00.000Z'),
  })
}
