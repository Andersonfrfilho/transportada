/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ModuleFetchRouter } from '@adatechnology/module-http/fetch'

import type { CompanyFiscalEnvironmentPort } from '../companies/application/company-fiscal-environment.port'
import type { FiscalEnvironment } from '../database/database.schema'
import type { HealthService } from '../health/health.service'
import type { AuthenticationPort } from '../identity/application/identity.port'
import type { TenantContextService } from '../identity/application/tenant-context.service'
import type { RouteAuthorizationPolicy } from '../identity/domain/authorization.policy'
import type { AuthenticatedContext, CompanyContext } from '../identity/domain/tenant-context'
import { NOTIFICATION_ROUTES_BASE_PATH } from '../notification/notification.constant'
import {
  API_AUTH_ME_PATH,
  API_LIVE_PATH,
  API_READY_PATH,
  HTTP_ERROR,
  HTTP_GET_METHOD,
  JSON_CONTENT_TYPE,
  PATH_PARAMETER_SEGMENT_PATTERN,
} from '../shared/api.constant'
import { ApiError } from '../shared/api.error'
import type { AuthMeResponse, HealthResponse } from '../shared/api.types'
import { resolveLogPathname } from './request-path.service'

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
  readonly pathParameterFormat?: PathParameterFormat
}

/**
 * Como o segmento dinâmico é lido antes de a rota existir:
 * - 'canonicalUuid' decodifica e exige UUID canônico; o que não for vira 404 sem tocar na rota.
 * - 'raw' decodifica e entrega como está — convites precisam distinguir id malformado (400, erro do
 *   cliente) de usuário de outra empresa (404, sem confirmar que existe), e quem decide é o `parse`.
 * - 'opaque' não decodifica nada: o segmento é segredo comparado byte a byte, e decodificar criaria
 *   dois caminhos para o mesmo token e um 404 observável quando o percent-escape fosse inválido.
 */
type PathParameterFormat = 'canonicalUuid' | 'opaque' | 'raw'

export type RegisteredRouterRoute = {
  readonly execute: (params: RouteParserParams) => Promise<Response>
  readonly method: string
  readonly pathname: string
  readonly pathParameterFormat?: PathParameterFormat
  readonly policy?: RouteAuthorizationPolicy
}

export type AnonymousRouteParserParams = {
  readonly correlationId: string
  readonly pathParameters: RouterPathParameters
  readonly request: Request
}

type AnonymousRouteHandlerParams<TInput> = {
  readonly correlationId: string
  readonly input: TInput
}

type AnonymousRouterRoute<TInput> = {
  readonly handle: (params: AnonymousRouteHandlerParams<TInput>) => Promise<Response>
  readonly method: string
  readonly parse: (params: AnonymousRouteParserParams) => TInput | Promise<TInput>
  readonly pathname: string
  readonly pathParameterFormat?: PathParameterFormat
}

export type RegisteredAnonymousRoute = {
  readonly execute: (params: AnonymousRouteParserParams) => Promise<Response>
  readonly method: string
  readonly pathname: string
  readonly pathParameterFormat?: PathParameterFormat
}

type RouterRequest = {
  readonly correlationId: string
  readonly method: string
  readonly pathname: string
  readonly request: Request
}

type DynamicRouteCandidate = {
  readonly method: string
  readonly pathname: string
  readonly pathParameterFormat?: PathParameterFormat
}

type MatchedRoute<TRoute extends DynamicRouteCandidate> = {
  readonly pathParameters: RouterPathParameters
  readonly route: TRoute
}

export type HttpRouter = {
  /**
   * Métodos registrados para o caminho, na ordem canônica. É a fonte do preflight: rota nova
   * ganha CORS por existir, sem lista paralela para alguém esquecer de atualizar.
   */
  allowedMethods(pathname: string): readonly string[]
  handle(request: RouterRequest): Promise<Response>
  /**
   * Nome da rota que respondeu, para o log de acesso. Quem sabe quais rotas existem é o roteador —
   * uma allowlist paralela de caminho literal envelhece calada e chama de `<unmatched>` rota viva.
   * O valor devolvido é sempre um template registrado, nunca o caminho pedido: identificador e
   * token continuam fora do log.
   */
  logPathname(pathname: string): string
}

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

type CreateRouterParams = {
  readonly anonymousRoutes?: readonly RegisteredAnonymousRoute[]
  readonly authentication: AuthenticationPort
  readonly authorization: RouteAuthorizationPort
  readonly companyFiscalEnvironment: CompanyFiscalEnvironmentPort
  readonly healthService: HealthService
  /**
   * Módulo plugável servido pelo adaptador dele: resolve a própria autenticação pelo `authResolver`
   * da aplicação e devolve `Response` pronta. Entra depois das rotas nossas e antes do 404 daqui —
   * um caminho do produto nunca é capturado por engano.
   */
  readonly moduleRouter?: ModuleFetchRouter
  readonly routes: readonly RegisteredRouterRoute[]
  readonly tenantContext: Pick<TenantContextService, 'resolveCompany'>
}

export function createRouter({
  anonymousRoutes = [],
  authentication,
  authorization,
  companyFiscalEnvironment,
  healthService,
  moduleRouter,
  routes,
  tenantContext,
}: CreateRouterParams): HttpRouter {
  const moduleCandidates = toModuleCandidates(moduleRouter)
  const logTemplates = collectLogTemplates({ anonymousRoutes, moduleCandidates, routes })
  return Object.freeze({
    allowedMethods(pathname: string): readonly string[] {
      return collectAllowedMethods({ anonymousRoutes, moduleCandidates, pathname, routes })
    },
    logPathname(pathname: string): string {
      return resolveLogPathname({ pathname, templates: logTemplates })
    },
    async handle({ correlationId, method, pathname, request }: RouterRequest): Promise<Response> {
      if (isHealthPath(pathname)) {
        return handleHealthRequest({ healthService, method, pathname })
      }

      const anonymousRoute = matchRoute({ method, pathname, routes: anonymousRoutes })
      if (anonymousRoute !== undefined) {
        return anonymousRoute.route.execute({
          correlationId,
          pathParameters: anonymousRoute.pathParameters,
          request,
        })
      }
      // Caminho anônimo com método errado morre aqui: descobrir isso não pode custar autenticação.
      if (anonymousRoutes.some((candidate) => routeMatchesPathname({ candidate, pathname }))) {
        throw new ApiError(HTTP_ERROR.notFound)
      }

      // Antes de autenticar aqui: o módulo tem rota pública (webhook, protegida por assinatura) e
      // resolve identidade pelo `authResolver` dele. Autenticar duas vezes daria 401 no que é
      // público. Os conjuntos são disjuntos pelo prefixo `/v1`, que nenhuma rota nossa usa.
      if (moduleRouter?.match(request) === true) return moduleRouter.handle(request)

      const identity = await authentication.authenticate(request.headers.get('authorization'))
      if (pathname === API_AUTH_ME_PATH) {
        return handleAuthMeRequest({ companyFiscalEnvironment, identity, method, tenantContext })
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
    ...(route.pathParameterFormat ? { pathParameterFormat: route.pathParameterFormat } : {}),
    ...(route.policy ? { policy: route.policy } : {}),
  })
}

export function defineAnonymousRoute<TInput>(
  route: AnonymousRouterRoute<TInput>,
): RegisteredAnonymousRoute {
  return Object.freeze({
    async execute({
      correlationId,
      pathParameters,
      request,
    }: AnonymousRouteParserParams): Promise<Response> {
      const input = await route.parse({ correlationId, pathParameters, request })
      return route.handle({ correlationId, input })
    },
    method: route.method,
    pathname: route.pathname,
    ...(route.pathParameterFormat ? { pathParameterFormat: route.pathParameterFormat } : {}),
  })
}

/**
 * O módulo declara as rotas dele como dado; aqui elas viram candidatas só para o preflight. O
 * formato é `raw` porque o segmento dinâmico do módulo nem sempre é UUID (`:driver` do webhook), e
 * exigir UUID esconderia o caminho do CORS.
 */
function toModuleCandidates(moduleRouter: ModuleFetchRouter | undefined): DynamicRouteCandidate[] {
  if (moduleRouter === undefined) return []
  return moduleRouter.routes.map((route) => ({
    method: route.method,
    pathParameterFormat: 'raw' as const,
    pathname: `${NOTIFICATION_ROUTES_BASE_PATH}${route.path}`,
  }))
}

type CollectLogTemplatesParams = {
  readonly anonymousRoutes: readonly RegisteredAnonymousRoute[]
  readonly moduleCandidates: readonly DynamicRouteCandidate[]
  readonly routes: readonly RegisteredRouterRoute[]
}

/**
 * Saúde e `/auth/me` não estão em `routes` — são atendidos dentro do `handle` —, e mesmo assim
 * precisam se nomear no log. Um caminho serve várias rotas (uma por método), e o log guarda o
 * caminho, não o método: por isso o conjunto é deduplicado.
 */
function collectLogTemplates({
  anonymousRoutes,
  moduleCandidates,
  routes,
}: CollectLogTemplatesParams): readonly string[] {
  return [
    ...new Set([
      API_AUTH_ME_PATH,
      API_LIVE_PATH,
      API_READY_PATH,
      ...anonymousRoutes.map((route) => route.pathname),
      ...routes.map((route) => route.pathname),
      ...moduleCandidates.map((candidate) => candidate.pathname),
    ]),
  ]
}

type CollectAllowedMethodsParams = {
  readonly anonymousRoutes: readonly RegisteredAnonymousRoute[]
  readonly moduleCandidates: readonly DynamicRouteCandidate[]
  readonly pathname: string
  readonly routes: readonly RegisteredRouterRoute[]
}

function collectAllowedMethods({
  anonymousRoutes,
  moduleCandidates,
  pathname,
  routes,
}: CollectAllowedMethodsParams): readonly string[] {
  if (isHealthPath(pathname) || pathname === API_AUTH_ME_PATH) {
    return [HTTP_GET_METHOD]
  }

  const anonymousMethods = anonymousRoutes
    .filter((candidate) => routeMatchesPathname({ candidate, pathname }))
    .map((candidate) => candidate.method)
  const authenticatedMethods = routes
    .filter((candidate) => routeMatchesPathname({ candidate, pathname }))
    .map((candidate) => candidate.method)
  const moduleMethods = moduleCandidates
    .filter((candidate) => routeMatchesPathname({ candidate, pathname }))
    .map((candidate) => candidate.method)

  return [...new Set([...anonymousMethods, ...authenticatedMethods, ...moduleMethods])].sort(
    (left, right) => methodRank(left) - methodRank(right),
  )
}

function methodRank(method: string): number {
  const rank = METHOD_ORDER.indexOf(method as (typeof METHOD_ORDER)[number])
  return rank === -1 ? METHOD_ORDER.length : rank
}

type RouteMatchesPathnameParams<TRoute extends DynamicRouteCandidate> = {
  readonly candidate: TRoute
  readonly pathname: string
}

function routeMatchesPathname<TRoute extends DynamicRouteCandidate>({
  candidate,
  pathname,
}: RouteMatchesPathnameParams<TRoute>): boolean {
  if (findParameterSegments(candidate.pathname.split('/')).length === 0) {
    return candidate.pathname === pathname
  }
  return matchDynamicRoute({ candidate, pathname }) !== undefined
}

type MatchRouteParams<TRoute extends DynamicRouteCandidate> = {
  readonly method: string
  readonly pathname: string
  readonly routes: readonly TRoute[]
}

function matchRoute<TRoute extends DynamicRouteCandidate>({
  method,
  pathname,
  routes,
}: MatchRouteParams<TRoute>): MatchedRoute<TRoute> | undefined {
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
    .find((candidate): candidate is MatchedRoute<TRoute> => candidate !== undefined)
}

type MatchDynamicRouteParams<TRoute extends DynamicRouteCandidate> = {
  readonly candidate: TRoute
  readonly pathname: string
}

function matchDynamicRoute<TRoute extends DynamicRouteCandidate>({
  candidate,
  pathname,
}: MatchDynamicRouteParams<TRoute>): MatchedRoute<TRoute> | undefined {
  const routeSegments = candidate.pathname.split('/')
  const requestSegments = pathname.split('/')
  const parameters = findParameterSegments(routeSegments)
  if (parameters.length === 0 || routeSegments.length !== requestSegments.length) {
    return undefined
  }

  if (!staticSegmentsMatch({ parameters, requestSegments, routeSegments })) {
    return undefined
  }

  const pathParameters = collectPathParameters({
    format: candidate.pathParameterFormat ?? 'canonicalUuid',
    parameters,
    requestSegments,
  })
  if (pathParameters === undefined) return undefined

  return { pathParameters, route: candidate }
}

type PathParameterSegment = {
  readonly index: number
  readonly name: string
}

function findParameterSegments(routeSegments: readonly string[]): readonly PathParameterSegment[] {
  return routeSegments.flatMap((segment, index) => {
    if (!PATH_PARAMETER_SEGMENT_PATTERN.test(segment)) return []
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
  readonly format: PathParameterFormat
  readonly parameters: readonly PathParameterSegment[]
  readonly requestSegments: readonly string[]
}): RouterPathParameters | undefined {
  const entries: [string, string][] = []
  for (const parameter of input.parameters) {
    const identifier = input.requestSegments[parameter.index]
    if (identifier === undefined) return undefined
    if (input.format === 'opaque') {
      entries.push([parameter.name, identifier])
      continue
    }
    const decodedIdentifier = decodeIdentifier(identifier)
    if (decodedIdentifier === undefined) return undefined
    if (input.format === 'canonicalUuid' && !isCanonicalUuid(decodedIdentifier)) return undefined
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
  readonly companyFiscalEnvironment: CompanyFiscalEnvironmentPort
  readonly identity: AuthenticatedContext<CompanyContext>['identity']
  readonly method: string
  readonly tenantContext: Pick<TenantContextService, 'resolveCompany'>
}

type ToAuthMeResponseParams = {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly fiscalEnvironment: FiscalEnvironment | null
}

async function handleAuthMeRequest({
  companyFiscalEnvironment,
  identity,
  method,
  tenantContext,
}: HandleAuthMeRequestParams): Promise<Response> {
  assertGetMethod(method)
  const context = await tenantContext.resolveCompany(identity)
  const fiscalEnvironment = await companyFiscalEnvironment.readEnvironment({
    companyId: context.scope.companyId,
  })
  return jsonResponse({ body: toAuthMeResponse({ context, fiscalEnvironment }), status: 200 })
}

function assertGetMethod(method: string): void {
  if (method !== HTTP_GET_METHOD) {
    throw new ApiError({ ...HTTP_ERROR.methodNotAllowed, headers: { allow: HTTP_GET_METHOD } })
  }
}

function toAuthMeResponse({ context, fiscalEnvironment }: ToAuthMeResponseParams): AuthMeResponse {
  return {
    data: {
      company: { fiscalEnvironment, id: context.scope.companyId },
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
