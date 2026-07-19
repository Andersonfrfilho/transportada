/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../src/health/health.service'
import { createRequestHandler } from '../src/http/request-handler.service'
import type { AuthenticationPort } from '../src/identity/application/identity.port'
import { TenantContextService } from '../src/identity/application/tenant-context.service'
import type { MembershipRepositoryPort } from '../src/identity/application/tenant-context.port'
import type { AuthenticatedIdentity } from '../src/identity/domain/authenticated-identity'
import { ApiError } from '../src/shared/api.error'
import type { ApiLogger, DatabaseHealthPort, RequestTimeoutPort } from '../src/shared/api.types'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000003'
const CORRELATION_ID = 'auth-me-request'

describe('GET /auth/me contract', () => {
  test('returns only the active company identity, deterministic roles and permissions', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      new Request('http://localhost/auth/me', {
        headers: { authorization: 'Bearer header.payload.signature' },
      }),
      fixture.server,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body).toEqual({
      data: {
        company: { id: COMPANY_ID },
        identity: { userId: USER_ID },
        permissions: [
          'invoices.import',
          'invoices.read',
          'batches.create',
          'batches.approve',
          'freight.simulate',
          'cte.issue',
          'cte.cancel',
          'cte.read',
        ],
        roles: ['fiscal', 'viewer'],
      },
    })
    const serializedBody = JSON.stringify(body)
    for (const forbidden of [
      'header.payload.signature',
      'issuer',
      'subject',
      'externalIdentityId',
      'platformAdmin',
      'companyIdClaim',
    ]) {
      expect(serializedBody).not.toContain(forbidden)
    }
  })

  test('returns 401 for absent or invalid authentication and 403 for missing company membership', async () => {
    const unauthenticated = createFixture({
      authentication: {
        async authenticate() {
          throw new ApiError({
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            status: 401,
          })
        },
      },
    })
    const forbidden = createFixture({
      membership: {
        async findActiveByUserAndCompany() {
          return null
        },
      },
    })

    const missing = await unauthenticated.handle(
      new Request('http://localhost/auth/me'),
      unauthenticated.server,
    )
    const denied = await forbidden.handle(
      new Request('http://localhost/auth/me', {
        headers: { authorization: 'Bearer header.payload.signature' },
      }),
      forbidden.server,
    )

    expect(missing.status).toBe(401)
    expect(denied.status).toBe(403)
    expect(missing.headers.get('cache-control')).toBe('no-store')
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })

  test('authenticates before rejecting a non-GET /auth/me request', async () => {
    let authenticationCalls = 0
    const fixture = createFixture({
      authentication: {
        async authenticate() {
          authenticationCalls += 1
          return identity()
        },
      },
    })

    const response = await fixture.handle(
      new Request('http://localhost/auth/me', { method: 'POST' }),
      fixture.server,
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('allow')).toBe('GET')
    expect(authenticationCalls).toBe(1)
  })

  test('prevents caching even when authentication infrastructure fails', async () => {
    const fixture = createFixture({
      authentication: {
        async authenticate() {
          throw new Error('identity infrastructure unavailable')
        },
      },
    })

    const response = await fixture.handle(
      new Request('http://localhost/auth/me', {
        headers: { authorization: 'Bearer header.payload.signature' },
      }),
      fixture.server,
    )

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('keeps health public and unknown paths authenticated before their safe 404', async () => {
    let authenticationCalls = 0
    const fixture = createFixture({
      authentication: {
        async authenticate() {
          authenticationCalls += 1
          return identity()
        },
      },
    })

    const health = await fixture.handle(new Request('http://localhost/health/live'), fixture.server)
    const unknown = await fixture.handle(new Request('http://localhost/unknown'), fixture.server)

    expect(health.status).toBe(200)
    expect(unknown.status).toBe(404)
    expect(authenticationCalls).toBe(1)
  })

  test('writes only correlation ID and status using the auth/me safe log template', async () => {
    const fixture = createFixture()

    await fixture.handle(
      new Request('http://localhost/auth/me?token=secret', {
        headers: {
          authorization: 'Bearer header.payload.signature',
          'x-correlation-id': CORRELATION_ID,
        },
      }),
      fixture.server,
    )

    expect(fixture.logs).toEqual([
      {
        message: 'auth_me_request_completed',
        metadata: { correlationId: CORRELATION_ID, status: 200 },
      },
    ])
    expect(JSON.stringify(fixture.logs)).not.toContain('secret')
    expect(JSON.stringify(fixture.logs)).not.toContain('header.payload.signature')
  })
})

type CreateFixtureParams = {
  readonly authentication?: AuthenticationPort
  readonly membership?: MembershipRepositoryPort
}

function createFixture({
  authentication = {
    async authenticate() {
      return identity()
    },
  },
  membership = {
    async findActiveByUserAndCompany() {
      return {
        membershipId: '00000000-0000-4000-8000-000000000004',
        roles: ['fiscal', 'viewer'] as const,
      }
    },
  },
}: CreateFixtureParams = {}) {
  const logs: Array<{ readonly message: string; readonly metadata?: Record<string, unknown> }> = []
  const logger: ApiLogger = {
    error(message, metadata) {
      logs.push({ message, metadata })
    },
    info(message, metadata) {
      logs.push({ message, metadata })
    },
    warn(message, metadata) {
      logs.push({ message, metadata })
    },
  }
  const handle = createRequestHandler({
    authentication,
    createCorrelationId: () => CORRELATION_ID,
    healthService: new HealthService({ database: healthyDatabase() }),
    logger,
    requestTimeoutSeconds: 10,
    tenantContext: new TenantContextService({ repository: membership }),
  })
  const server: RequestTimeoutPort = { timeout() {} }

  return { handle, logs, server }
}

function identity(): AuthenticatedIdentity {
  return Object.freeze({
    companyIdClaim: COMPANY_ID,
    externalIdentityId: '00000000-0000-4000-8000-000000000005',
    issuer: 'https://identity.example.test/realms/transportada',
    platformAdmin: true,
    subject: 'keycloak-user',
    userId: USER_ID,
  })
}

function healthyDatabase(): DatabaseHealthPort {
  return {
    async close() {},
    async healthCheck() {
      return { healthy: true }
    },
  }
}
