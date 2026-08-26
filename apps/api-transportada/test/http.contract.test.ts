/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../src/health/health.service'
import { createRequestHandler } from '../src/http/request-handler.service'
import { resolveLogPathname } from '../src/http/request-path.service'
import type { RegisteredRouterRoute } from '../src/http/router.service'
import type {
  AuthenticationPort,
  IdentityReadinessPort,
} from '../src/identity/application/identity.port'
import { TenantContextService } from '../src/identity/application/tenant-context.service'
import { HTTP_ERROR } from '../src/shared/api.constant'
import { ApiError } from '../src/shared/api.error'
import type { ApiLogger, DatabaseHealthPort, RequestTimeoutPort } from '../src/shared/api.types'
import { createHttpRouterFixture } from './fixtures/http-router.fixture'

const NOW = new Date('2026-07-18T12:00:00.000Z')
const GENERATED_CORRELATION_ID = '00000000-0000-4000-8000-000000000008'

describe('API HTTP contracts', () => {
  test('reports liveness without checking PostgreSQL', async () => {
    let healthChecks = 0
    let identityChecks = 0
    const fixture = createFixture({
      database: {
        async healthCheck() {
          healthChecks += 1
          return { healthy: true }
        },
        async close() {},
      },
      identityReadiness: {
        async checkReadiness() {
          identityChecks += 1
          return true
        },
      },
    })

    const response = await fixture.handle(
      new Request('http://localhost/health/live', {
        headers: { 'x-correlation-id': '  Client-Request_123  ' },
      }),
      fixture.server,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-correlation-id')).toBe('Client-Request_123')
    expect(await response.json()).toEqual({
      service: 'api',
      status: 'ok',
      timestamp: NOW.toISOString(),
    })
    expect(healthChecks).toBe(0)
    expect(identityChecks).toBe(0)
    expect(fixture.timeouts).toEqual([10])
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({
        correlationId: 'Client-Request_123',
        method: 'GET',
        pathname: '/health/live',
        status: 200,
      }),
    )
  })

  test('generates a correlation ID when the incoming value is invalid', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      new Request('http://localhost/health/live', {
        headers: { 'x-correlation-id': 'contains spaces' },
      }),
      fixture.server,
    )

    expect(response.headers.get('x-correlation-id')).toBe(GENERATED_CORRELATION_ID)
  })

  test('reports readiness from PostgreSQL and identity independently', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      dependencies: { database: 'up', identity: 'up', migrations: 'up' },
      service: 'api',
      status: 'ok',
      timestamp: NOW.toISOString(),
    })
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({
        correlationId: GENERATED_CORRELATION_ID,
        method: 'GET',
        pathname: '/health/ready',
        status: 200,
      }),
    )
  })

  test('returns degraded readiness without leaking the database error', async () => {
    const fixture = createFixture({
      database: {
        async healthCheck() {
          throw new Error('postgresql://user:secret@database/private')
        },
        async close() {},
      },
    })
    const response = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      dependencies: { database: 'down', identity: 'up', migrations: 'up' },
      service: 'api',
      status: 'degraded',
      timestamp: NOW.toISOString(),
    })
    expect(JSON.stringify(fixture.logs)).not.toContain('secret')
  })

  test('reports identity degradation without leaking provider details', async () => {
    const fixture = createFixture({
      identityReadiness: {
        async checkReadiness() {
          throw new Error('http://identity.internal/realms/private?secret=value')
        },
      },
    })
    const response = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      dependencies: { database: 'up', identity: 'down', migrations: 'up' },
      service: 'api',
      status: 'degraded',
      timestamp: NOW.toISOString(),
    })
    expect(JSON.stringify(fixture.logs)).not.toContain('identity.internal')
    expect(JSON.stringify(fixture.logs)).not.toContain('secret')
  })

  test('checks both readiness dependencies even when both fail', async () => {
    let databaseChecks = 0
    let identityChecks = 0
    const fixture = createFixture({
      database: {
        async healthCheck() {
          databaseChecks += 1
          throw new Error('database unavailable')
        },
        async close() {},
      },
      identityReadiness: {
        async checkReadiness() {
          identityChecks += 1
          return false
        },
      },
    })

    const response = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      dependencies: { database: 'down', identity: 'down', migrations: 'up' },
      status: 'degraded',
    })
    expect(databaseChecks).toBe(1)
    expect(identityChecks).toBe(1)
  })

  test('returns to ready when identity recovers on a later request', async () => {
    let identityChecks = 0
    const fixture = createFixture({
      identityReadiness: {
        async checkReadiness() {
          identityChecks += 1
          return identityChecks > 1
        },
      },
    })

    const degraded = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )
    const recovered = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )

    expect(degraded.status).toBe(503)
    expect(await degraded.json()).toMatchObject({
      dependencies: { database: 'up', identity: 'down', migrations: 'up' },
      status: 'degraded',
    })
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toMatchObject({
      dependencies: { database: 'up', identity: 'up', migrations: 'up' },
      status: 'ok',
    })
    expect(identityChecks).toBe(2)
  })

  test('returns safe structured errors for unknown routes and methods', async () => {
    const fixture = createFixture()
    const notFound = await fixture.handle(
      new Request('http://localhost/not-found?token=secret'),
      fixture.server,
    )
    const methodNotAllowed = await fixture.handle(
      new Request('http://localhost/health/live', { method: 'POST' }),
      fixture.server,
    )

    expect(notFound.status).toBe(404)
    expect(await notFound.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        correlationId: GENERATED_CORRELATION_ID,
        message: 'Resource not found',
      },
    })
    expect(methodNotAllowed.status).toBe(405)
    expect(methodNotAllowed.headers.get('allow')).toBe('GET')
    expect(await methodNotAllowed.json()).toEqual({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        correlationId: GENERATED_CORRELATION_ID,
        message: 'Method not allowed',
      },
    })
    expect(JSON.stringify(fixture.logs)).not.toContain('token')
    expect(JSON.stringify(fixture.logs)).not.toContain('secret')
  })

  test('keeps health public and authenticates before protected routing', async () => {
    let authenticationCalls = 0
    const fixture = createFixture({
      authentication: {
        async authenticate() {
          authenticationCalls += 1
          throw new ApiError(HTTP_ERROR.unauthenticated)
        },
      },
    })

    const live = await fixture.handle(new Request('http://localhost/health/live'), fixture.server)
    const protectedResponse = await fixture.handle(
      new Request('http://localhost/private', {
        headers: { authorization: 'Bearer secret.token.value' },
      }),
      fixture.server,
    )

    expect(live.status).toBe(200)
    expect(protectedResponse.status).toBe(401)
    expect(await protectedResponse.json()).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        correlationId: GENERATED_CORRELATION_ID,
        message: 'Authentication required',
      },
    })
    expect(authenticationCalls).toBe(1)
    expect(JSON.stringify(fixture.logs)).not.toContain('secret.token.value')
  })

  test('returns a safe 500 when authentication infrastructure fails unexpectedly', async () => {
    const fixture = createFixture({
      authentication: {
        async authenticate() {
          throw new Error('postgresql://user:secret@database/private')
        },
      },
    })

    const response = await fixture.handle(
      new Request('http://localhost/private', {
        headers: { authorization: 'Bearer secret.token.value' },
      }),
      fixture.server,
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        correlationId: GENERATED_CORRELATION_ID,
        message: 'Internal server error',
      },
    })
    expect(JSON.stringify(fixture.logs)).not.toContain('postgresql')
    expect(JSON.stringify(fixture.logs)).not.toContain('secret.token.value')
  })

  test('logs the shape of an unexpected database failure without leaking its message', async () => {
    const recognizableValue = 'batch-name-9f2c'
    const fixture = createFixture({
      authentication: {
        async authenticate() {
          const driverError = Object.assign(
            new Error(
              `duplicate key value violates unique constraint, Key (name)=(${recognizableValue}) already exists`,
            ),
            {
              constraint: 'cte_batches_company_id_name_unique',
              errno: '23505',
              name: 'PostgresError',
            },
          )
          const queryError = new Error('Failed query: insert into "cte_batches"', {
            cause: driverError,
          })
          queryError.name = 'DrizzleQueryError'
          throw queryError
        },
      },
    })

    const response = await fixture.handle(
      new Request('http://localhost/private', {
        headers: { authorization: 'Bearer contract.token.value' },
      }),
      fixture.server,
    )

    expect(response.status).toBe(500)
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({
        constraint: 'cte_batches_company_id_name_unique',
        correlationId: GENERATED_CORRELATION_ID,
        errorName: 'DrizzleQueryError',
        sqlState: '23505',
      }),
    )
    const serializedLogs = JSON.stringify(fixture.logs)
    expect(serializedLogs).not.toContain(recognizableValue)
    expect(serializedLogs).not.toContain('duplicate key value')
    expect(serializedLogs).not.toContain('Failed query')
    expect(serializedLogs).not.toContain('contract.token.value')
  })

  test('never logs an unmatched pathname that resembles a token', async () => {
    const tokenLikePathname = '/header.payload.signature'
    const fixture = createFixture({
      authentication: {
        async authenticate() {
          throw new ApiError(HTTP_ERROR.unauthenticated)
        },
      },
    })

    const response = await fixture.handle(
      new Request(`http://localhost${tokenLikePathname}`),
      fixture.server,
    )

    expect(response.status).toBe(401)
    expect(JSON.stringify(fixture.logs)).not.toContain(tokenLikePathname)
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({
        pathname: '<unmatched>',
        status: 401,
      }),
    )
  })

  /**
   * Defeito visto em produção: 269 das 276 entradas de `http_request_completed` diziam
   * `<unmatched>` devolvendo 200 — o log de acesso não servia para forense nenhuma. O caminho
   * pedido carrega identificador e não pode entrar no log; o **template** da rota que respondeu
   * carrega a mesma garantia e ainda diz onde a requisição bateu.
   */
  test('logs the matched route template instead of the identifier in the path', async () => {
    const vehicleId = '00000000-0000-4000-8000-0000000000ff'
    const fixture = createFixture({
      routes: [
        {
          async execute() {
            return new Response(null, { status: 204 })
          },
          method: 'GET',
          pathname: '/fleet/vehicles/:vehicleId',
        },
      ],
    })

    const response = await fixture.handle(
      new Request(`http://localhost/fleet/vehicles/${vehicleId}`),
      fixture.server,
    )

    // Rota registrada sem política é negada por padrão; o log da recusa carrega o mesmo caminho
    expect(response.status).toBe(403)
    expect(JSON.stringify(fixture.logs)).not.toContain(vehicleId)
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        pathname: '/fleet/vehicles/:vehicleId',
        status: 403,
      }),
    )
  })

  test('does not check dependencies after the request is aborted', async () => {
    let healthChecks = 0
    const controller = new AbortController()
    controller.abort()
    const fixture = createFixture({
      database: {
        async healthCheck() {
          healthChecks += 1
          return { healthy: true }
        },
        async close() {},
      },
    })
    const response = await fixture.handle(
      new Request('http://localhost/health/ready', { signal: controller.signal }),
      fixture.server,
    )

    expect(response.status).toBe(499)
    expect(healthChecks).toBe(0)
  })

  test('rejects invalid request metadata with a structured error', async () => {
    const fixture = createFixture()
    const pathname = `/${'x'.repeat(2_049)}`
    const response = await fixture.handle(
      new Request(`http://localhost${pathname}`),
      fixture.server,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: 'INVALID_REQUEST',
        correlationId: GENERATED_CORRELATION_ID,
        message: 'Invalid request',
      },
    })
  })

  test('still returns a response when request logging fails', async () => {
    const fixture = createFixture({ loggerThrows: true })

    const response = await fixture.handle(
      new Request('http://localhost/health/live'),
      fixture.server,
    )

    expect(response.status).toBe(200)
  })
})

/**
 * A redação continua sendo a regra: o valor que entra no log é sempre um template registrado, nunca
 * o que o cliente digitou. O que muda é que agora o template diz qual rota respondeu.
 */
describe('access log pathname contract', () => {
  const TEMPLATES = [
    '/fleet/vehicles',
    '/fleet/vehicles/:vehicleId',
    '/public/nfse-callbacks/:token',
    '/health/live',
  ]

  test('names the static route it matched', () => {
    expect(resolveLogPathname({ pathname: '/fleet/vehicles', templates: TEMPLATES })).toBe(
      '/fleet/vehicles',
    )
    expect(resolveLogPathname({ pathname: '/health/live', templates: TEMPLATES })).toBe(
      '/health/live',
    )
  })

  /** O segmento dinâmico é onde mora o segredo: o token do callback jamais pode virar log. */
  test('names the dynamic route without ever echoing the segment', () => {
    const token = 'header.payload.signature'

    expect(
      resolveLogPathname({ pathname: `/public/nfse-callbacks/${token}`, templates: TEMPLATES }),
    ).toBe('/public/nfse-callbacks/:token')
    expect(
      resolveLogPathname({
        pathname: '/fleet/vehicles/00000000-0000-4000-8000-000000000001',
        templates: TEMPLATES,
      }),
    ).toBe('/fleet/vehicles/:vehicleId')
  })

  /** Mesma precedência do roteador: estático exato ganha do dinâmico que também casaria. */
  test('prefers the exact static route over a dynamic one that also matches', () => {
    expect(
      resolveLogPathname({
        pathname: '/fleet/vehicles/summary',
        templates: ['/fleet/vehicles/:vehicleId', '/fleet/vehicles/summary'],
      }),
    ).toBe('/fleet/vehicles/summary')
  })

  test('falls back to the redacted marker for anything unregistered', () => {
    expect(
      resolveLogPathname({ pathname: '/header.payload.signature', templates: TEMPLATES }),
    ).toBe('<unmatched>')
    // Contagem de segmentos diferente não casa, e segmento vazio não é valor de parâmetro
    expect(resolveLogPathname({ pathname: '/fleet/vehicles/1/2', templates: TEMPLATES })).toBe(
      '<unmatched>',
    )
    expect(resolveLogPathname({ pathname: '/fleet/vehicles/', templates: TEMPLATES })).toBe(
      '<unmatched>',
    )
    expect(resolveLogPathname({ pathname: '/fleet/vehicles', templates: [] })).toBe('<unmatched>')
  })
})

type CreateFixtureParams = {
  readonly authentication?: AuthenticationPort
  readonly database?: DatabaseHealthPort
  readonly identityReadiness?: IdentityReadinessPort
  readonly loggerThrows?: boolean
  readonly routes?: readonly RegisteredRouterRoute[]
}

function createFixture({
  authentication = authenticated(),
  database = healthyDatabase(),
  identityReadiness = readyIdentity(),
  loggerThrows = false,
  routes = [],
}: CreateFixtureParams = {}) {
  const logs: Array<Record<string, unknown>> = []
  const timeouts: number[] = []
  const logger: ApiLogger = {
    error(_message, metadata) {
      if (loggerThrows) {
        throw new Error('logger unavailable')
      }
      logs.push(metadata ?? {})
    },
    info(_message, metadata) {
      if (loggerThrows) {
        throw new Error('logger unavailable')
      }
      logs.push(metadata ?? {})
    },
    warn(_message, metadata) {
      if (loggerThrows) {
        throw new Error('logger unavailable')
      }
      logs.push(metadata ?? {})
    },
  }
  const healthService = new HealthService({
    database,
    identityReadiness,
    migrationStatus: {
      async countPending() {
        return 0
      },
    },
    now: () => NOW,
  })
  const tenantContext = new TenantContextService({
    repository: {
      async findActiveByUserAndCompany() {
        return { membershipId: '00000000-0000-4000-8000-000000000004', roles: [] }
      },
    },
  })
  const handle = createRequestHandler({
    createCorrelationId: () => GENERATED_CORRELATION_ID,
    frontendOrigins: ['http://localhost:53000'],
    logger,
    requestTimeoutSeconds: 10,
    router: createHttpRouterFixture({ authentication, healthService, routes, tenantContext }),
  })
  const server: RequestTimeoutPort = {
    timeout(_request, seconds) {
      timeouts.push(seconds)
    },
  }

  return { handle, logger, logs, server, timeouts }
}

function authenticated(): AuthenticationPort {
  return {
    async authenticate() {
      return {
        companyIdClaim: '00000000-0000-4000-8000-000000000001',
        externalIdentityId: '00000000-0000-4000-8000-000000000002',
        issuer: 'http://localhost:58080/realms/transportada-local',
        platformAdmin: false,
        subject: 'contract-user',
        userId: '00000000-0000-4000-8000-000000000003',
      }
    },
  }
}

function healthyDatabase(): DatabaseHealthPort {
  return {
    async healthCheck() {
      return { healthy: true }
    },
    async close() {},
  }
}

function readyIdentity(): IdentityReadinessPort {
  return {
    async checkReadiness() {
      return true
    },
  }
}
