/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ModuleFetchRouter } from '@adatechnology/module-http/fetch'

import type { CompanyFiscalEnvironmentPort } from '../companies/application/company-fiscal-environment.port'
import type { UserPictureExistencePort } from '../identity/application/user-picture.port'
import type { FiscalEnvironment } from '../database/database.schema'
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
  PATH_PARAMETER_SEGMENT_PATTERN,
} from '../shared/api.constant'
import { ApiError } from '../shared/api.error'
import type { AuthMeResponse, HealthResponse } from '../shared/api.types'
import {
  type AnonymousRateLimit,
  type AnonymousTargetGate,
  createAnonymousRateLimit,
} from './anonymous-rate-limit.service'
import {
  type ClientIpResolver,
  createClientIpResolver,
  DEFAULT_CLIENT_IP_POLICY,
} from './client-ip.service'
import type { RateLimitSubjectService } from './rate-limit-subject.service'
import type { RateLimitWindowStorePort } from './rate-limit-window.port'
import {
  type AnonymousRateLimitPolicy,
  createRateLimiter,
  type RateLimiter,
  type RateLimitOutcome,
  type RateLimitPolicy,
  type RegisteredAnonymousRateLimitPolicy,
  type RouteRateLimitPolicy,
} from './rate-limiter.service'
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
  /**
   * Teto por usuário autenticado, conferido depois da autorização e antes do `parse`: corpo
   * inválido e replay idempotente também gastam. `memory` conta no processo; `postgres` conta entre
   * réplicas, por empresa e usuário. Ausente, a rota não tem teto.
   */
  readonly rateLimit?: RouteRateLimitPolicy
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
  readonly rateLimit?: RouteRateLimitPolicy
}

export type AnonymousRouteParserParams = {
  readonly correlationId: string
  readonly pathParameters: RouterPathParameters
  readonly request: Request
}

/**
 * Spec 191: o roteador entrega o balde do alvo junto com o pedido. Rota com alvo declarado e sem o
 * balde recusa o pedido — quem chama `execute` fora do roteador não abre porta sem teto.
 */
export type AnonymousRouteExecuteParams = AnonymousRouteParserParams & {
  readonly limitTarget?: AnonymousTargetGate
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
  /**
   * Sem isto a rota fica sem teto de volume — todo endpoint anônimo deveria declarar um. `memory`
   * (só `maxRequests`/`windowMs`) conta por IP no processo; `postgres` conta por IP em dois estágios
   * e, com `target`, também pelo texto digitado (spec 191 RF12).
   */
  readonly rateLimit?: RateLimitPolicy | AnonymousRateLimitPolicy<TInput>
}

export type RegisteredAnonymousRoute = {
  readonly execute: (params: AnonymousRouteExecuteParams) => Promise<Response>
  readonly method: string
  readonly pathname: string
  readonly pathParameterFormat?: PathParameterFormat
  readonly rateLimit?: RateLimitPolicy | RegisteredAnonymousRateLimitPolicy
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
   * Módulos plugáveis servidos pelos próprios adaptadores: cada um resolve a autenticação dele
   * (`authResolver`) e devolve `Response` pronta. Entram depois das rotas nossas e antes do 404
   * daqui — um caminho do produto nunca é capturado por engano. Mais de um porque notificação e
   * conta de agregado (`user-module`) são módulos plugáveis distintos, com prefixo próprio cada um.
   * `basePath` vem separado porque `ModuleFetchRouter` não o expõe de volta — só o usa internamente
   * pra compilar as rotas — e o preflight de CORS precisa dele pra montar o caminho completo.
   */
  readonly moduleRouters?: readonly {
    readonly basePath: string
    readonly router: ModuleFetchRouter
  }[]
  /**
   * Spec 150 T406: o balde compartilhado das rotas com teto `postgres`. Ausente, o boot recusa
   * qualquer rota que o declare — teto que não conta é porta aberta calada.
   */
  readonly rateLimitWindows?: RateLimitWindowStorePort
  /**
   * Spec 191: o HMAC das chaves da rota anônima com teto no Postgres. Ausente, o boot recusa
   * qualquer rota anônima que o declare — IP em claro na tabela seria PII guardada por 24 h.
   */
  readonly rateLimitSubjects?: RateLimitSubjectService
  /** Ausente, vale `DEFAULT_CLIENT_IP_POLICY` — o mesmo padrão do ambiente (ADR-0076 §6). */
  readonly resolveClientIp?: ClientIpResolver
  readonly routes: readonly RegisteredRouterRoute[]
  readonly tenantContext: Pick<TenantContextService, 'resolveCompany'>
  readonly userPictureExistence: UserPictureExistencePort
}

export function createRouter({
  anonymousRoutes = [],
  authentication,
  authorization,
  companyFiscalEnvironment,
  healthService,
  moduleRouters = [],
  rateLimitSubjects,
  rateLimitWindows,
  resolveClientIp = createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
  routes,
  tenantContext,
  userPictureExistence,
}: CreateRouterParams): HttpRouter {
  assertMembershipRoutesUnderMe(routes)
  assertAnyPermissionRoutesAreReads(routes)
  assertPostgresRateLimitHasStore({ rateLimitWindows, routes: [...routes, ...anonymousRoutes] })
  assertAnonymousPostgresRateLimitHasSubjects({ anonymousRoutes, rateLimitSubjects })
  const moduleCandidates = toModuleCandidates(moduleRouters)
  const logTemplates = collectLogTemplates({ anonymousRoutes, moduleCandidates, routes })
  const rateLimiter = createRateLimiter()
  const anonymousRateLimit = createAnonymousRateLimit({
    rateLimiter,
    rateLimitSubjects,
    rateLimitWindows,
  })
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
        await assertWithinAnonymousRateLimit({
          anonymousRateLimit,
          clientIp: resolveClientIp(request),
          rateLimiter,
          route: anonymousRoute.route,
        })
        return anonymousRoute.route.execute({
          correlationId,
          limitTarget: anonymousRateLimit.consumeTarget,
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
      // público. Os conjuntos são disjuntos pelo prefixo (`/v1`, `/user`), que nenhuma rota nossa usa.
      const matchedModuleRouter = moduleRouters.find((candidate) => candidate.router.match(request))
      if (matchedModuleRouter !== undefined) return matchedModuleRouter.router.handle(request)

      const identity = await authentication.authenticate(request.headers.get('authorization'))
      if (pathname === API_AUTH_ME_PATH) {
        return handleAuthMeRequest({
          companyFiscalEnvironment,
          identity,
          method,
          tenantContext,
          userPictureExistence,
        })
      }

      const matchedRoute = matchRoute({ method, pathname, routes })
      if (matchedRoute === undefined) {
        throw new ApiError(HTTP_ERROR.notFound)
      }

      const context = await tenantContext.resolveCompany(
        identity,
        request.headers.get(SERVICE_COMPANY_HEADER),
      )
      authorization.authorize(context, matchedRoute.route.policy)
      await assertWithinRouteRateLimit({
        context,
        rateLimiter,
        rateLimitWindows,
        route: matchedRoute.route,
      })
      return matchedRoute.route.execute({
        context,
        correlationId,
        pathParameters: matchedRoute.pathParameters,
        request,
      })
    },
  })
}

/**
 * ADR-0047 §3: a empresa do **service account** chega no pedido, e chega por cabeçalho para o
 * roteador seguir genérico — deduzi-la do recurso exigiria consultar cada tabela antes de autorizar.
 * Para token de gente ele é **ignorado**: quem manda é a claim, e o `tenant-context` é quem decide
 * isso, num lugar só.
 */
const SERVICE_COMPANY_HEADER = 'x-company-id'

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
    ...(route.rateLimit ? { rateLimit: route.rateLimit } : {}),
  })
}

const OWN_DATA_PATH_PREFIX = '/me/'

/**
 * Spec 144 T005b M2: a política de membership não pede permissão nenhuma, e só é segura enquanto a
 * rota alcança dado da própria pessoa. Toda rota passa por aqui, então pendurá-la em outro caminho
 * derruba o boot em vez de abrir uma porta calada.
 */
function assertMembershipRoutesUnderMe(routes: readonly RegisteredRouterRoute[]): void {
  const misplaced = routes.filter(
    (route) =>
      route.policy !== undefined &&
      'membership' in route.policy &&
      !route.pathname.startsWith(OWN_DATA_PATH_PREFIX),
  )
  if (misplaced.length === 0) return

  const signatures = misplaced.map((route) => `${route.method} ${route.pathname}`).join(', ')
  throw new Error(`membership policy outside ${OWN_DATA_PATH_PREFIX}: ${signatures}`)
}

const READ_METHOD = 'GET'

/**
 * Spec 156 D11: "qualquer uma de" foi decidida para leitura. Numa escrita ela seria o jeito mais
 * silencioso de alargar quem escreve — então rota assim fora de `GET` derruba o boot.
 */
function assertAnyPermissionRoutesAreReads(routes: readonly RegisteredRouterRoute[]): void {
  const misplaced = routes.filter(
    (route) =>
      route.policy !== undefined && 'anyPermission' in route.policy && route.method !== READ_METHOD,
  )
  if (misplaced.length === 0) return

  const signatures = misplaced.map((route) => `${route.method} ${route.pathname}`).join(', ')
  throw new Error(`anyPermission policy outside ${READ_METHOD}: ${signatures}`)
}

export function defineAnonymousRoute<TInput>(
  route: AnonymousRouterRoute<TInput>,
): RegisteredAnonymousRoute {
  return Object.freeze({
    async execute({
      correlationId,
      limitTarget,
      pathParameters,
      request,
    }: AnonymousRouteExecuteParams): Promise<Response> {
      const input = await route.parse({ correlationId, pathParameters, request })
      await assertWithinAnonymousTargetLimit({ input, limitTarget, route })
      return route.handle({ correlationId, input })
    },
    method: route.method,
    pathname: route.pathname,
    ...(route.pathParameterFormat ? { pathParameterFormat: route.pathParameterFormat } : {}),
    ...(route.rateLimit ? { rateLimit: toRegisteredAnonymousRateLimit(route.rateLimit) } : {}),
  })
}

/** O roteador não precisa da função que extrai o alvo: ela só roda dentro do `execute`. */
function toRegisteredAnonymousRateLimit<TInput>(
  policy: RateLimitPolicy | AnonymousRateLimitPolicy<TInput>,
): RateLimitPolicy | RegisteredAnonymousRateLimitPolicy {
  if (!('store' in policy)) return policy
  const { target, ...shared } = policy
  if (target === undefined) return shared
  return {
    ...shared,
    target: {
      maxRequests: target.maxRequests,
      scope: target.scope,
      windowSeconds: target.windowSeconds,
    },
  }
}

/**
 * Spec 191 RF12: o alvo conta depois do `parse` (só ali o texto existe) e antes do `handle`. É o
 * texto digitado, normalizado pela rota — não o usuário resolvido —, para o 429 sair igual para
 * quem existe e para quem não existe.
 */
async function assertWithinAnonymousTargetLimit<TInput>(input: {
  readonly input: TInput
  readonly limitTarget: AnonymousTargetGate | undefined
  readonly route: AnonymousRouterRoute<TInput>
}): Promise<void> {
  const policy = input.route.rateLimit
  if (policy === undefined || !('store' in policy) || policy.target === undefined) return
  if (input.limitTarget === undefined) {
    throw new Error(
      `anonymous target rate limit without a gate: ${input.route.method} ${input.route.pathname}`,
    )
  }

  const { key, ...ceiling } = policy.target
  throwWhenRateLimited(
    await input.limitTarget({
      policy: { ...ceiling, store: 'postgres' },
      target: key(input.input),
    }),
  )
}

/**
 * A rota anônima conta por IP antes do `parse`. `memory` é o balde do processo, com o IP como
 * chave; `postgres` é o dos dois estágios, com o IP em HMAC (spec 191 RF12).
 */
async function assertWithinAnonymousRateLimit(input: {
  readonly anonymousRateLimit: AnonymousRateLimit
  readonly clientIp: string
  readonly rateLimiter: RateLimiter
  readonly route: RegisteredAnonymousRoute
}): Promise<void> {
  const policy = input.route.rateLimit
  if (policy === undefined) return
  if (!('store' in policy)) {
    assertWithinRateLimit({
      key: `${input.route.method} ${input.route.pathname} ${input.clientIp}`,
      policy,
      rateLimiter: input.rateLimiter,
    })
    return
  }

  throwWhenRateLimited(
    await input.anonymousRateLimit.consumeClientIp({ clientIp: input.clientIp, policy }),
  )
}

/**
 * Sem `rateLimit` declarado, a rota anônima segue sem teto — é opt-in, não porque anônima sem
 * limite seja seguro, mas porque cada rota tem um volume legítimo diferente (candidatura de
 * agregado não é o mesmo tráfego que o callback de NFS-e da prefeitura) e um teto genérico erraria
 * pra um lado ou pro outro. `429` carrega `Retry-After` para o cliente saber quando tentar de novo.
 * A rota anônima conta por IP; a autenticada, por usuário — quem chama é quem decide o balde.
 */
function assertWithinRateLimit(input: {
  readonly key: string
  readonly policy: RateLimitPolicy | undefined
  readonly rateLimiter: RateLimiter
}): void {
  if (input.policy === undefined) return

  throwWhenRateLimited(input.rateLimiter.consume({ key: input.key, policy: input.policy }))
}

type AssertWithinRouteRateLimitParams = {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly rateLimiter: RateLimiter
  readonly rateLimitWindows: RateLimitWindowStorePort | undefined
  readonly route: RegisteredRouterRoute
}

/**
 * Spec 150 T406: sem try/catch de propósito. O balde do Postgres fora do ar derruba o pedido em 500
 * — sem saber quantos envios já saíram, o envio não sai (fail-closed).
 */
async function assertWithinRouteRateLimit({
  context,
  rateLimiter,
  rateLimitWindows,
  route,
}: AssertWithinRouteRateLimitParams): Promise<void> {
  const policy = route.rateLimit
  if (policy === undefined) return
  if (policy.store === 'memory') {
    assertWithinRateLimit({
      key: `${route.method} ${route.pathname} user:${context.scope.userId}`,
      policy,
      rateLimiter,
    })
    return
  }
  // Rodada de correção da Fase 4: o `if`+`throw` daqui só existia para estreitar o tipo — o boot
  // (`assertPostgresRateLimitHasStore`) já recusa subir com uma rota `postgres` sem `rateLimitWindows`
  // configurado, então este ponto é inalcançável em runtime. A asserção documenta a prova em vez de
  // fingir um caminho de erro que nunca dispara.
  throwWhenRateLimited(
    await rateLimitWindows!.consume({
      maxRequests: policy.maxRequests,
      scope: policy.scope,
      subjectKey: `${context.scope.companyId}:${context.scope.userId}`,
      windowSeconds: policy.windowSeconds,
    }),
  )
}

function throwWhenRateLimited(outcome: RateLimitOutcome): void {
  if (outcome.allowed) return
  throw new ApiError({
    ...HTTP_ERROR.tooManyRequests,
    headers: { 'retry-after': String(outcome.retryAfterSeconds) },
  })
}

type RateLimitedRouteCandidate = {
  readonly method: string
  readonly pathname: string
  readonly rateLimit?:
    | RateLimitPolicy
    | RegisteredAnonymousRateLimitPolicy
    | RouteRateLimitPolicy
    | undefined
}

function declaresPostgresRateLimit(route: RateLimitedRouteCandidate): boolean {
  return (
    route.rateLimit !== undefined &&
    'store' in route.rateLimit &&
    route.rateLimit.store === 'postgres'
  )
}

function assertPostgresRateLimitHasStore(input: {
  readonly rateLimitWindows: RateLimitWindowStorePort | undefined
  readonly routes: readonly RateLimitedRouteCandidate[]
}): void {
  if (input.rateLimitWindows !== undefined) return
  const orphans = input.routes.filter(declaresPostgresRateLimit)
  if (orphans.length === 0) return

  const signatures = orphans.map((route) => `${route.method} ${route.pathname}`).join(', ')
  throw new Error(`postgres rate limit without a store: ${signatures}`)
}

/** Spec 191: sem a chave do HMAC, o IP e o alvo chegariam em claro ao banco — o boot recusa. */
function assertAnonymousPostgresRateLimitHasSubjects(input: {
  readonly anonymousRoutes: readonly RegisteredAnonymousRoute[]
  readonly rateLimitSubjects: RateLimitSubjectService | undefined
}): void {
  if (input.rateLimitSubjects !== undefined) return
  const orphans = input.anonymousRoutes.filter(declaresPostgresRateLimit)
  if (orphans.length === 0) return

  const signatures = orphans.map((route) => `${route.method} ${route.pathname}`).join(', ')
  throw new Error(`anonymous postgres rate limit without a subject key: ${signatures}`)
}

/**
 * Cada módulo declara as rotas dele como dado; aqui elas viram candidatas só para o preflight. O
 * formato é `raw` porque o segmento dinâmico do módulo nem sempre é UUID (`:driver` do webhook), e
 * exigir UUID esconderia o caminho do CORS.
 */
function toModuleCandidates(
  moduleRouters: readonly { readonly basePath: string; readonly router: ModuleFetchRouter }[],
): DynamicRouteCandidate[] {
  return moduleRouters.flatMap(({ basePath, router }) =>
    router.routes.map((route) => ({
      method: route.method,
      pathParameterFormat: 'raw' as const,
      pathname: `${basePath}${route.path}`,
    })),
  )
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
  readonly userPictureExistence: UserPictureExistencePort
}

type ToAuthMeResponseParams = {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly fiscalEnvironment: FiscalEnvironment | null
  readonly hasPicture: boolean
}

async function handleAuthMeRequest({
  companyFiscalEnvironment,
  identity,
  method,
  tenantContext,
  userPictureExistence,
}: HandleAuthMeRequestParams): Promise<Response> {
  assertGetMethod(method)
  const context = await tenantContext.resolveCompany(identity)
  const [fiscalEnvironment, hasPicture] = await Promise.all([
    companyFiscalEnvironment.readEnvironment({ companyId: context.scope.companyId }),
    userPictureExistence.hasPicture({
      companyId: context.scope.companyId,
      userId: context.identity.userId,
    }),
  ])
  return jsonResponse({
    body: toAuthMeResponse({ context, fiscalEnvironment, hasPicture }),
    status: 200,
  })
}

function assertGetMethod(method: string): void {
  if (method !== HTTP_GET_METHOD) {
    throw new ApiError({ ...HTTP_ERROR.methodNotAllowed, headers: { allow: HTTP_GET_METHOD } })
  }
}

function toAuthMeResponse({
  context,
  fiscalEnvironment,
  hasPicture,
}: ToAuthMeResponseParams): AuthMeResponse {
  return {
    data: {
      company: { fiscalEnvironment, id: context.scope.companyId },
      identity: { hasPicture, userId: context.identity.userId },
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
