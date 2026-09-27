/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 191 RF12, ADR-0076 §3: a rota anônima com teto no Postgres conta em dois estágios — o balde
 * em memória da réplica, com o mesmo teto, recusa sem tocar no banco; só o que passa consome
 * `rate_limit_windows`, que é o que soma entre réplicas. O IP conta antes do `parse`; o alvo, depois
 * do `parse` e antes do `handle`. As duas chaves chegam ao banco como HMAC: a tabela não guarda IP
 * nem o que a pessoa digitou.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import {
  createClientIpResolver,
  DEFAULT_CLIENT_IP_POLICY,
} from '../../src/http/client-ip.service.js'
import type {
  ConsumeRateLimitWindowParams,
  RateLimitWindowStorePort,
} from '../../src/http/rate-limit-window.port.js'
import { createRateLimitSubjectService } from '../../src/http/rate-limit-subject.service.js'
import type { RateLimitOutcome } from '../../src/http/rate-limiter.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter, defineAnonymousRoute } from '../../src/http/router.service.js'
import { ApiError } from '../../src/shared/api.error.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const PATHNAME = '/anonymous-rate-limit-contract'
const IP_SCOPE = 'anonymous-contract-ip'
const TARGET_SCOPE = 'anonymous-contract-target'
const CLIENT_IP = '198.51.100.23'
const TYPED_TARGET = 'ana@empresa.test'
const SUBJECT_KEY = Uint8Array.from(Buffer.alloc(32, 11))

type StoreBehaviour = 'allow' | 'deny' | 'deny-target' | 'fail'

type RouteInput = { readonly identifier: string }

const NOT_CALLED = () => {
  throw new Error('ROUTER_DEPENDENCY_NOT_EXPECTED')
}

function buildRouter(input: {
  readonly behaviour?: StoreBehaviour
  readonly ipMaxRequests?: number
  readonly targetMaxRequests?: number
  readonly withTarget?: boolean
  readonly withoutStore?: boolean
  readonly withoutSubjects?: boolean
}) {
  const events: string[] = []
  const calls: ConsumeRateLimitWindowParams[] = []
  const store: RateLimitWindowStorePort = {
    async consume(params): Promise<RateLimitOutcome> {
      events.push(`consume:${params.scope}`)
      calls.push(params)
      if (input.behaviour === 'fail') throw new Error('rate limit store unavailable')
      if (input.behaviour === 'deny') return { allowed: false, retryAfterSeconds: 321 }
      if (input.behaviour === 'deny-target' && params.scope === TARGET_SCOPE) {
        return { allowed: false, retryAfterSeconds: 654 }
      }
      return { allowed: true }
    },
  }
  const router = createRouter({
    anonymousRoutes: [
      defineAnonymousRoute<RouteInput>({
        async handle() {
          events.push('handle')
          return new Response(null, { status: 204 })
        },
        method: 'POST',
        async parse({ request }) {
          events.push('parse')
          const body = (await request.json()) as RouteInput
          return { identifier: body.identifier }
        },
        pathname: PATHNAME,
        rateLimit: {
          maxRequests: input.ipMaxRequests ?? 10,
          scope: IP_SCOPE,
          store: 'postgres',
          ...(input.withTarget === true
            ? {
                target: {
                  key: (parsed: RouteInput) => parsed.identifier.trim().toLowerCase(),
                  maxRequests: input.targetMaxRequests ?? 3,
                  scope: TARGET_SCOPE,
                  windowSeconds: 3_600,
                },
              }
            : {}),
          windowSeconds: 900,
        },
      }),
    ],
    authentication: { authenticate: NOT_CALLED },
    authorization: { authorize: NOT_CALLED },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
      now: () => new Date('2026-09-25T12:00:00.000Z'),
    }),
    ...(input.withoutStore === true ? {} : { rateLimitWindows: store }),
    ...(input.withoutSubjects === true
      ? {}
      : { rateLimitSubjects: createRateLimitSubjectService({ key: SUBJECT_KEY }) }),
    resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
    routes: [],
    tenantContext: { resolveCompany: NOT_CALLED },
    userPictureExistence: stubUserPictureExistence(),
  })
  return { calls, events, router }
}

function anonymousRequest(input: { readonly clientIp?: string; readonly identifier?: string }) {
  return new Request(`http://localhost${PATHNAME}`, {
    body: JSON.stringify({ identifier: input.identifier ?? TYPED_TARGET }),
    headers: { 'content-type': 'application/json', 'x-real-ip': input.clientIp ?? CLIENT_IP },
    method: 'POST',
  })
}

function call(
  router: ReturnType<typeof buildRouter>['router'],
  input: { readonly clientIp?: string; readonly identifier?: string } = {},
) {
  return router.handle({
    correlationId: 'anonymous-rate-limit-contract',
    method: 'POST',
    pathname: PATHNAME,
    request: anonymousRequest(input),
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

describe('limitador anônimo em dois estágios, por IP (spec 191 T1.2)', () => {
  test('consome o IP no Postgres antes do parse, no escopo e no teto que a rota declarou', async () => {
    const fixture = buildRouter({})

    const response = await call(fixture.router)

    expect(response.status).toBe(204)
    expect(fixture.events).toEqual([`consume:${IP_SCOPE}`, 'parse', 'handle'])
    expect(fixture.calls).toEqual([
      {
        maxRequests: 10,
        scope: IP_SCOPE,
        subjectKey: expect.stringMatching(/^ip:[A-Za-z0-9_-]{43}$/),
        windowSeconds: 900,
      },
    ])
  })

  test('a chave que chega ao banco não carrega o IP em claro', async () => {
    const fixture = buildRouter({})

    await call(fixture.router)

    const subjectKey = fixture.calls[0]?.subjectKey ?? ''
    expect(subjectKey).not.toContain(CLIENT_IP)
    expect(subjectKey).not.toContain(CLIENT_IP.replaceAll('.', ''))
  })

  test('o mesmo IP cai no mesmo balde, e outro IP em outro', async () => {
    const fixture = buildRouter({})

    await call(fixture.router)
    await call(fixture.router)
    await call(fixture.router, { clientIp: '198.51.100.24' })

    const [first, second, other] = fixture.calls.map((params) => params.subjectKey)
    expect(first).toBe(second)
    expect(other).not.toBe(first)
  })

  test('acima do teto em memória, o store não é chamado', async () => {
    const fixture = buildRouter({ ipMaxRequests: 2 })

    expect((await call(fixture.router)).status).toBe(204)
    expect((await call(fixture.router)).status).toBe(204)
    const error = await captureError(() => call(fixture.router))

    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS', status: 429 })
    expect((error as ApiError).headers?.['retry-after']).toMatch(/^[1-9][0-9]*$/)
    expect(fixture.calls).toHaveLength(2)
    expect(fixture.events.filter((event) => event === 'parse')).toHaveLength(2)
  })

  test('o Postgres estourado responde 429 com Retry-After, sem chegar ao parse', async () => {
    const fixture = buildRouter({ behaviour: 'deny' })

    const error = await captureError(() => call(fixture.router))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      headers: { 'retry-after': '321' },
      status: 429,
    })
    expect(fixture.events).toEqual([`consume:${IP_SCOPE}`])
  })

  /** Fail-closed: sem saber quantos pedidos já passaram, o pedido não passa — e o erro vira 500. */
  test('o store fora do ar dá 500, nunca passagem livre', async () => {
    const fixture = buildRouter({ behaviour: 'fail' })

    const handleRequest = createRequestHandler({
      createCorrelationId: () => 'anonymous-rate-limit-contract',
      frontendOrigins: ['http://localhost:53000'],
      logger: { error() {}, info() {}, warn() {} },
      requestTimeoutSeconds: 10,
      router: fixture.router,
    })
    const response = await handleRequest(anonymousRequest({}), { timeout() {} })

    expect(response.status).toBe(500)
    expect(fixture.events).toEqual([`consume:${IP_SCOPE}`])
  })
})

describe('limitador anônimo por alvo (spec 191 T1.2)', () => {
  test('o alvo é consumido depois do parse e antes do handle', async () => {
    const fixture = buildRouter({ withTarget: true })

    const response = await call(fixture.router)

    expect(response.status).toBe(204)
    expect(fixture.events).toEqual([
      `consume:${IP_SCOPE}`,
      'parse',
      `consume:${TARGET_SCOPE}`,
      'handle',
    ])
    expect(fixture.calls[1]).toEqual({
      maxRequests: 3,
      scope: TARGET_SCOPE,
      subjectKey: expect.stringMatching(/^target:[A-Za-z0-9_-]{43}$/),
      windowSeconds: 3_600,
    })
  })

  test('a chave do alvo não carrega o texto digitado em claro', async () => {
    const fixture = buildRouter({ withTarget: true })

    await call(fixture.router)

    const subjectKey = fixture.calls[1]?.subjectKey ?? ''
    expect(subjectKey.toLowerCase()).not.toContain('ana')
    expect(subjectKey.toLowerCase()).not.toContain('empresa')
  })

  test('o texto normalizado pela rota decide o balde, não o IP', async () => {
    const fixture = buildRouter({ withTarget: true })

    await call(fixture.router, { clientIp: '198.51.100.30', identifier: 'ANA@empresa.test ' })
    await call(fixture.router, { clientIp: '198.51.100.31', identifier: 'ana@empresa.test' })

    const targetKeys = fixture.calls
      .filter((params) => params.scope === TARGET_SCOPE)
      .map((params) => params.subjectKey)
    expect(targetKeys).toHaveLength(2)
    expect(targetKeys[0]).toBe(targetKeys[1])
  })

  test('o mesmo texto em escopos diferentes não dá a mesma chave', async () => {
    const subjects = createRateLimitSubjectService({ key: SUBJECT_KEY })

    expect(subjects.forTarget({ scope: 'a', target: TYPED_TARGET })).not.toBe(
      subjects.forTarget({ scope: 'b', target: TYPED_TARGET }),
    )
    expect(subjects.forClientIp({ clientIp: CLIENT_IP, scope: 'a' })).not.toBe(
      subjects.forTarget({ scope: 'a', target: CLIENT_IP }),
    )
  })

  test('acima do teto do alvo em memória, o store do alvo não é chamado e nada chega ao handle', async () => {
    const fixture = buildRouter({ targetMaxRequests: 1, withTarget: true })

    expect((await call(fixture.router, { clientIp: '198.51.100.40' })).status).toBe(204)
    const error = await captureError(() => call(fixture.router, { clientIp: '198.51.100.41' }))

    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS', status: 429 })
    expect(fixture.calls.filter((params) => params.scope === TARGET_SCOPE)).toHaveLength(1)
    expect(fixture.events.filter((event) => event === 'handle')).toHaveLength(1)
  })

  test('o alvo estourado no Postgres responde 429 com Retry-After, sem chegar ao handle', async () => {
    const fixture = buildRouter({ behaviour: 'deny-target', withTarget: true })

    const error = await captureError(() => call(fixture.router))

    expect(error).toMatchObject({ headers: { 'retry-after': '654' }, status: 429 })
    expect(fixture.events).toEqual([`consume:${IP_SCOPE}`, 'parse', `consume:${TARGET_SCOPE}`])
  })
})

describe('guarda de boot do limitador anônimo (spec 191 T1.2)', () => {
  test('rota anônima com teto no Postgres não sobe sem o store', () => {
    expect(() => buildRouter({ withoutStore: true })).toThrow(
      `postgres rate limit without a store: POST ${PATHNAME}`,
    )
  })

  test('rota anônima com teto no Postgres não sobe sem a chave do HMAC', () => {
    expect(() => buildRouter({ withoutSubjects: true })).toThrow(
      `anonymous postgres rate limit without a subject key: POST ${PATHNAME}`,
    )
  })
})
