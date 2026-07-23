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

export type RouterPathParameters = Readonly<Record<string, string>>

export type RouteParserParams = {
  readonly correlationId: string
  readonly context: AuthenticatedContext<CompanyContext>
  readonly pathParameters: RouterPathParameters
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
  readonly correlationId: string
  readonly method: string
  readonly pathname: string
  readonly request: Request
}

type MatchedRouterRoute = {
  readonly pathParameters: RouterPathParameters
  readonly route: RegisteredRouterRoute
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
    async handle({ correlationId, method, pathname, request }: RouterRequest): Promise<Response> {
      if (isHealthPath(pathname)) {
        return handleHealthRequest({ healthService, method, pathname })
      }

      const identity = await authentication.authenticate(request.headers.get('authorization'))
      if (pathname === API_AUTH_ME_PATH) {
        return handleAuthMeRequest({ identity, method, tenantContext })
      }

      const matchedRoute = matchRoute({ method, pathname, routes })
      if (matchedRoute === undefined) {
        throw new ApiError(HTTP_ERROR.notFound)
      }

      const context = await tenantContext.resolveCompany(identity)
      authorization.authorize(context, matchedRoute.route.policy)
      return matchedRoute.route.execute({
        context,
        correlationId,
        pathParameters: matchedRoute.pathParameters,
        request,
      })
    },
  })
}

export function defineRoute<TInput>(route: RouterRoute<TInput>): RegisteredRouterRoute {
  return Object.freeze({
    async execute({
      context,
      correlationId,
      pathParameters,
      request,
    }: RouteParserParams): Promise<Response> {
      const input = await route.parse({ context, correlationId, pathParameters, request })
      return route.handle({ context, input })
    },
    method: route.method,
    pathname: route.pathname,
    ...(route.policy ? { policy: route.policy } : {}),
  })
}

type MatchRouteParams = {
  readonly method: string
  readonly pathname: string
  readonly routes: readonly RegisteredRouterRoute[]
}

function matchRoute({
  method,
  pathname,
  routes,
}: MatchRouteParams): MatchedRouterRoute | undefined {
  const exactRoute = routes.find(
    (candidate) =>
      candidate.method === method &&
      candidate.pathname === pathname &&
      findParameterSegments(candidate.pathname.split('/')).length === 0,
  )
  if (exactRoute !== undefined) {
    return { pathParameters: Object.freeze({}), route: exactRoute }
  }

  return routes
    .filter((candidate) => candidate.method === method)
    .map((candidate) => matchDynamicRoute({ candidate, pathname }))
    .find((candidate): candidate is MatchedRouterRoute => candidate !== undefined)
}

type MatchDynamicRouteParams = {
  readonly candidate: RegisteredRouterRoute
  readonly pathname: string
}

function matchDynamicRoute({
  candidate,
  pathname,
}: MatchDynamicRouteParams): MatchedRouterRoute | undefined {
  const routeSegments = candidate.pathname.split('/')
  const requestSegments = pathname.split('/')
  const parameters = findParameterSegments(routeSegments)
  if (parameters.length === 0 || routeSegments.length !== requestSegments.length) {
    return undefined
  }

  if (!staticSegmentsMatch({ parameters, requestSegments, routeSegments })) {
    return undefined
  }

  const pathParameters = collectPathParameters({ parameters, requestSegments })
  if (pathParameters === undefined) return undefined

  return { pathParameters, route: candidate }
}

type PathParameterSegment = {
  readonly index: number
  readonly name: string
}

function findParameterSegments(routeSegments: readonly string[]): readonly PathParameterSegment[] {
  return routeSegments.flatMap((segment, index) => {
    if (!/^:[A-Za-z][A-Za-z0-9]*$/.test(segment)) return []
    return [{ index, name: segment.slice(1) }]
  })
}

type StaticSegmentsMatchParams = {
  readonly parameters: readonly PathParameterSegment[]
  readonly requestSegments: readonly string[]
  readonly routeSegments: readonly string[]
}

function staticSegmentsMatch({
  parameters,
  requestSegments,
  routeSegments,
}: StaticSegmentsMatchParams): boolean {
  const parameterIndexes = new Set(parameters.map((parameter) => parameter.index))
  return routeSegments.every(
    (segment, index) => parameterIndexes.has(index) || segment === requestSegments[index],
  )
}

function collectPathParameters(input: {
  readonly parameters: readonly PathParameterSegment[]
  readonly requestSegments: readonly string[]
}): RouterPathParameters | undefined {
  const entries: [string, string][] = []
  for (const parameter of input.parameters) {
    const identifier = input.requestSegments[parameter.index]
    if (identifier === undefined) return undefined
    const decodedIdentifier = decodeIdentifier(identifier)
    if (decodedIdentifier === undefined || !isCanonicalUuid(decodedIdentifier)) return undefined
    entries.push([parameter.name, decodedIdentifier])
  }
  return Object.freeze(Object.fromEntries(entries))
}

function decodeIdentifier(identifier: string): string | undefined {
  try {
    const decodedIdentifier = decodeURIComponent(identifier)
    return decodedIdentifier.includes('/') ? undefined : decodedIdentifier
  } catch {
    return undefined
  }
}

function isCanonicalUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
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
