/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../src/health/health.service'
import { createRequestHandler } from '../src/http/request-handler.service'
import type { AuthenticationPort } from '../src/identity/application/identity.port'
import { HTTP_ERROR } from '../src/shared/api.constant'
import { ApiError } from '../src/shared/api.error'
import type { ApiLogger, DatabaseHealthPort, RequestTimeoutPort } from '../src/shared/api.types'

const NOW = new Date('2026-07-18T12:00:00.000Z')
const GENERATED_CORRELATION_ID = '00000000-0000-4000-8000-000000000008'

describe('API HTTP contracts', () => {
  test('reports liveness without checking PostgreSQL', async () => {
    let healthChecks = 0
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
    expect(fixture.timeouts).toEqual([10])
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

  test('reports readiness from PostgreSQL only', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      dependencies: { database: 'up' },
      service: 'api',
      status: 'ok',
      timestamp: NOW.toISOString(),
    })
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
      dependencies: { database: 'down' },
      service: 'api',
      status: 'degraded',
      timestamp: NOW.toISOString(),
    })
    expect(JSON.stringify(fixture.logs)).not.toContain('secret')
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

type CreateFixtureParams = {
  readonly authentication?: AuthenticationPort
  readonly database?: DatabaseHealthPort
  readonly loggerThrows?: boolean
}

function createFixture({
  authentication = authenticated(),
  database = healthyDatabase(),
  loggerThrows = false,
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
    now: () => NOW,
  })
  const handle = createRequestHandler({
    authentication,
    createCorrelationId: () => GENERATED_CORRELATION_ID,
    healthService,
    logger,
    requestTimeoutSeconds: 10,
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
