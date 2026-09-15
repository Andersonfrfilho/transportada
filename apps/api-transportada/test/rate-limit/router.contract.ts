/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service'
import type {
  ConsumeRateLimitWindowParams,
  RateLimitWindowStorePort,
} from '../../src/http/rate-limit-window.port'
import type { RateLimitOutcome } from '../../src/http/rate-limiter.service'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, defineAnonymousRoute, defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture'
import { appliedMigrations } from '../fixtures/health.fixture'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture'

const COMPANY_ID = '00000000-0000-4000-8000-000000000011'
const USER_ID = '00000000-0000-4000-8000-000000000012'
const LIMITED_PATH = '/rate-limit-contract/limited'
const MEMORY_PATH = '/rate-limit-contract/memory'
const ANONYMOUS_PATH = '/rate-limit-contract/anonymous'
const SCOPE = 'contractor-mail'
const POLICY = { permission: 'settings.manage', scope: 'company' } as const

type StoreBehaviour = 'allow' | 'deny' | 'fail'

function createStore(behaviour: StoreBehaviour, events: string[]) {
  const calls: ConsumeRateLimitWindowParams[] = []
  const store: RateLimitWindowStorePort = {
    async consume(params): Promise<RateLimitOutcome> {
      events.push('consume')
      calls.push(params)
      if (behaviour === 'fail') throw new Error('rate limit store unavailable')
      if (behaviour === 'deny') return { allowed: false, retryAfterSeconds: 1_234 }
      return { allowed: true }
    },
  }
  return { calls, store }
}

function identity(): AuthenticatedIdentity {
  return {
    companyIdClaim: COMPANY_ID,
    externalIdentityId: '00000000-0000-4000-8000-000000000013',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    serviceAccount: false,
    subject: 'rate-limit-contract',
    userId: USER_ID,
  }
}

function companyContext(): AuthenticatedContext<CompanyContext> {
  return {
    identity: identity(),
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000014',
      permissions: new Set(['settings.manage'] as const),
      roles: ['company-admin'] as const,
      userId: USER_ID,
    },
  }
}

function buildRouter(input: {
  readonly behaviour?: StoreBehaviour
  readonly failParse?: boolean
  readonly withoutStore?: boolean
}) {
  const events: string[] = []
  const { calls, store } = createStore(input.behaviour ?? 'allow', events)
  const context = companyContext()
  const authorization = new AuthorizationService()
  const router = createRouter({
    anonymousRoutes: [
      defineAnonymousRoute({
        async handle() {
          events.push('anonymous-handle')
          return new Response(null, { status: 204 })
        },
        method: 'POST',
        parse: () => undefined,
        pathname: ANONYMOUS_PATH,
        rateLimit: { maxRequests: 1, windowMs: 60_000 },
      }),
    ],
    authentication: { authenticate: async () => identity() },
    authorization: { authorize: (target, policy) => authorization.authorize(target, policy) },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
      now: () => new Date('2026-09-15T12:00:00.000Z'),
    }),
    ...(input.withoutStore === true ? {} : { rateLimitWindows: store }),
    routes: [
      defineRoute({
        async handle() {
          events.push('handle')
          return new Response(null, { status: 202 })
        },
        method: 'POST',
        parse: () => {
          events.push('parse')
          if (input.failParse === true) {
            throw new ApiError({ code: 'VALIDATION_ERROR', message: 'Invalid', status: 400 })
          }
          return undefined
        },
        pathname: LIMITED_PATH,
        policy: POLICY,
        rateLimit: { maxRequests: 20, scope: SCOPE, store: 'postgres', windowSeconds: 3_600 },
      }),
      defineRoute({
        async handle() {
          events.push('memory-handle')
          return new Response(null, { status: 204 })
        },
        method: 'POST',
        parse: () => undefined,
        pathname: MEMORY_PATH,
        policy: POLICY,
        rateLimit: { maxRequests: 2, store: 'memory', windowMs: 60_000 },
      }),
    ],
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  return { calls, events, router }
}

function call(router: ReturnType<typeof buildRouter>['router'], pathname: string) {
  return router.handle({
    correlationId: 'rate-limit-contract',
    method: 'POST',
    pathname,
    request: new Request(`http://localhost${pathname}`, {
      headers: { authorization: 'Bearer header.payload.signature' },
      method: 'POST',
    }),
  })
}

async function captureError(run: () => Promise<Response>): Promise<unknown> {
  try {
    await run()
  } catch (error: unknown) {
    return error
  }
  throw new Error('Expected the router to reject the request')
}

describe('limitador com estado no Postgres, declarado na rota (spec 150 T406)', () => {
  test('estourado, responde 429 com Retry-After e TOO_MANY_REQUESTS, sem chegar ao caso de uso', async () => {
    const fixture = buildRouter({ behaviour: 'deny' })

    const error = await captureError(() => call(fixture.router, LIMITED_PATH))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      headers: { 'retry-after': '1234' },
      status: 429,
    })
    expect(fixture.events).toEqual(['consume'])
  })

  /** A chave é só UUID: nada de e-mail, nome ou IP numa tabela que ninguém expurga à mão. */
  test('conta por empresa e usuário, no escopo e com o teto que a rota declarou', async () => {
    const fixture = buildRouter({})

    const response = await call(fixture.router, LIMITED_PATH)

    expect(response.status).toBe(202)
    expect(fixture.events).toEqual(['consume', 'parse', 'handle'])
    expect(fixture.calls).toEqual([
      {
        maxRequests: 20,
        scope: SCOPE,
        subjectKey: `${COMPANY_ID}:${USER_ID}`,
        windowSeconds: 3_600,
      },
    ])
  })

  /** Conferido antes do `parse`: corpo inválido e replay idempotente também gastam o teto. */
  test('o pedido recusado por validação também conta', async () => {
    const fixture = buildRouter({ failParse: true })

    const error = await captureError(() => call(fixture.router, LIMITED_PATH))

    expect(error).toMatchObject({ status: 400 })
    expect(fixture.events).toEqual(['consume', 'parse'])
    expect(fixture.calls).toHaveLength(1)
  })

  /** Fail-closed: sem saber quantos envios já saíram, o envio não sai — e o erro vira 500. */
  test('limitador fora do ar derruba o pedido em vez de deixá-lo passar', async () => {
    const fixture = buildRouter({ behaviour: 'fail' })

    const error = await captureError(() => call(fixture.router, LIMITED_PATH))
    expect(error).not.toBeInstanceOf(ApiError)
    expect(fixture.events).toEqual(['consume'])

    const handleRequest = createRequestHandler({
      createCorrelationId: () => 'rate-limit-contract',
      frontendOrigins: ['http://localhost:53000'],
      logger: { error() {}, info() {}, warn() {} },
      requestTimeoutSeconds: 10,
      router: fixture.router,
    })
    const response = await handleRequest(
      new Request(`http://localhost${LIMITED_PATH}`, {
        headers: { authorization: 'Bearer header.payload.signature' },
        method: 'POST',
      }),
      { timeout() {} },
    )
    expect(response.status).toBe(500)
    expect(fixture.events).not.toContain('handle')
  })

  test('rota com teto no Postgres não sobe sem o limitador injetado', () => {
    expect(() => buildRouter({ withoutStore: true })).toThrow(
      'postgres rate limit without a store: POST /rate-limit-contract/limited',
    )
  })

  test('a rota com teto em memória segue igual, e não toca o Postgres', async () => {
    const fixture = buildRouter({})

    expect((await call(fixture.router, MEMORY_PATH)).status).toBe(204)
    expect((await call(fixture.router, MEMORY_PATH)).status).toBe(204)
    const error = await captureError(() => call(fixture.router, MEMORY_PATH))

    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS', status: 429 })
    expect((error as ApiError).headers?.['retry-after']).toMatch(/^[1-9][0-9]*$/)
    expect(fixture.calls).toEqual([])
  })

  test('a rota anônima segue em memória por IP, e não toca o Postgres', async () => {
    const fixture = buildRouter({})
    const anonymous = () =>
      fixture.router.handle({
        correlationId: 'rate-limit-contract',
        method: 'POST',
        pathname: ANONYMOUS_PATH,
        request: new Request(`http://localhost${ANONYMOUS_PATH}`, { method: 'POST' }),
      })

    expect((await anonymous()).status).toBe(204)
    const error = await captureError(anonymous)

    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS', status: 429 })
    expect(fixture.calls).toEqual([])
  })
})
