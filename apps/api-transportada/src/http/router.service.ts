/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { HealthService } from '../health/health.service'
import type { AuthenticationPort } from '../identity/application/identity.port'
import type { TenantContextService } from '../identity/application/tenant-context.service'
import type { RouteAuthorizationPolicy } from '../identity/domain/authorization.policy'
import type { AuthenticatedContext, CompanyContext } from '../identity/domain/tenant-context'
import {
  API_AUTH_ME_PATH,
  API_LIVE_PATH,
  API_READY_PATH,
  HTTP_ERROR,
  HTTP_GET_METHOD,
  JSON_CONTENT_TYPE,
} from '../shared/api.constant'
import { ApiError } from '../shared/api.error'
import type { AuthMeResponse, HealthResponse } from '../shared/api.types'

type RouteAuthorizationPort = {
  authorize(
    context: AuthenticatedContext<CompanyContext>,
    policy: RouteAuthorizationPolicy | undefined,
  ): void
}

type RouteParserParams = {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly request: Request
}

type RouteHandlerParams<TInput> = {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly input: TInput
}

type RouterRoute<TInput> = {
  readonly handle: (params: RouteHandlerParams<TInput>) => Promise<Response>
  readonly method: string
  readonly parse: (params: RouteParserParams) => TInput | Promise<TInput>
  readonly pathname: string
  readonly policy?: RouteAuthorizationPolicy
}

type RegisteredRouterRoute = {
  readonly execute: (params: RouteParserParams) => Promise<Response>
  readonly method: string
  readonly pathname: string
  readonly policy?: RouteAuthorizationPolicy
}

type RouterRequest = {
  readonly method: string
  readonly pathname: string
  readonly request: Request
}

export type HttpRouter = {
  handle(request: RouterRequest): Promise<Response>
}

type CreateRouterParams = {
  readonly authentication: AuthenticationPort
  readonly authorization: RouteAuthorizationPort
  readonly healthService: HealthService
  readonly routes: readonly RegisteredRouterRoute[]
  readonly tenantContext: Pick<TenantContextService, 'resolveCompany'>
}

export function createRouter({
  authentication,
  authorization,
  healthService,
  routes,
  tenantContext,
}: CreateRouterParams): HttpRouter {
  return Object.freeze({
    async handle({ method, pathname, request }: RouterRequest): Promise<Response> {
      if (isHealthPath(pathname)) {
        return handleHealthRequest({ healthService, method, pathname })
      }

      const identity = await authentication.authenticate(request.headers.get('authorization'))
      if (pathname === API_AUTH_ME_PATH) {
        return handleAuthMeRequest({ identity, method, tenantContext })
      }

      const route = routes.find(
        (candidate) => candidate.method === method && candidate.pathname === pathname,
      )
      if (route === undefined) {
        throw new ApiError(HTTP_ERROR.notFound)
      }

      const context = await tenantContext.resolveCompany(identity)
      authorization.authorize(context, route.policy)
      return route.execute({ context, request })
    },
  })
}

export function defineRoute<TInput>(route: RouterRoute<TInput>): RegisteredRouterRoute {
  return Object.freeze({
    async execute({ context, request }: RouteParserParams): Promise<Response> {
      const input = await route.parse({ context, request })
      return route.handle({ context, input })
    },
    method: route.method,
    pathname: route.pathname,
    ...(route.policy ? { policy: route.policy } : {}),
  })
}

function isHealthPath(pathname: string): boolean {
  return pathname === API_LIVE_PATH || pathname === API_READY_PATH
}

type HandleHealthRequestParams = {
  readonly healthService: HealthService
  readonly method: string
  readonly pathname: string
}

async function handleHealthRequest({
  healthService,
  method,
  pathname,
}: HandleHealthRequestParams): Promise<Response> {
  assertGetMethod(method)
  if (pathname === API_LIVE_PATH) {
    return jsonResponse({ body: healthService.live(), status: 200 })
  }

  const readiness = await healthService.ready()
  return jsonResponse({ body: readiness, status: readiness.status === 'ok' ? 200 : 503 })
}

type HandleAuthMeRequestParams = {
  readonly identity: AuthenticatedContext<CompanyContext>['identity']
  readonly method: string
  readonly tenantContext: Pick<TenantContextService, 'resolveCompany'>
}

async function handleAuthMeRequest({
  identity,
  method,
  tenantContext,
}: HandleAuthMeRequestParams): Promise<Response> {
  assertGetMethod(method)
  const context = await tenantContext.resolveCompany(identity)
  return jsonResponse({ body: toAuthMeResponse(context), status: 200 })
}

function assertGetMethod(method: string): void {
  if (method !== HTTP_GET_METHOD) {
    throw new ApiError({ ...HTTP_ERROR.methodNotAllowed, headers: { allow: HTTP_GET_METHOD } })
  }
}

function toAuthMeResponse(context: AuthenticatedContext<CompanyContext>): AuthMeResponse {
  return {
    data: {
      company: { id: context.scope.companyId },
      identity: { userId: context.identity.userId },
      permissions: [...context.scope.permissions],
      roles: [...context.scope.roles],
    },
  }
}

type JsonResponseParams = {
  readonly body: AuthMeResponse | HealthResponse
  readonly status: number
}

function jsonResponse({ body, status }: JsonResponseParams): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}
