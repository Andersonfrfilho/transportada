/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../src/config/environment.schema'
import { HealthService } from '../src/health/health.service'
import { appliedMigrations } from './fixtures/health.fixture'
import { createRequestHandler } from '../src/http/request-handler.service'
import type { AuthenticationPort } from '../src/identity/application/identity.port'
import { TenantContextService } from '../src/identity/application/tenant-context.service'
import type { MembershipRepositoryPort } from '../src/identity/application/tenant-context.port'
import { ApiError } from '../src/shared/api.error'
import type { ApiLogger, DatabaseHealthPort, RequestTimeoutPort } from '../src/shared/api.types'
import { CRYPTOGRAPHIC_ENVIRONMENT } from './fixtures/cryptographic-environment.fixture'
import { createHttpRouterFixture } from './fixtures/http-router.fixture'
import {
  ANONYMOUS_ROUTE_TABLE,
  concreteRoutePathname,
  createAnonymousRouteTableFixture,
  createRouteTableFixture,
  ROUTE_TABLE,
} from './fixtures/route-table.fixture'

const FRONTEND_ORIGIN = 'http://localhost:53000'
const OTHER_ORIGIN = 'https://attacker.example'
const CORRELATION_ID = 'cors-contract'
const BODYLESS_ALLOW_HEADERS = 'Authorization'
const RESOURCE_ALLOW_HEADERS = 'Authorization, Content-Type, Idempotency-Key'
const CTE_BATCH_ITEM_PATH = concreteRoutePathname('/cte-batches/:id/items/:itemId')
const BILLING_INVOICE_PATH = concreteRoutePathname('/billing/invoices/:id')
const FLEET_VEHICLE_PATH = concreteRoutePathname('/fleet/vehicles/:vehicleId')
const FLEET_DRIVER_PATH = concreteRoutePathname('/fleet/drivers/:driverId')
const FLEET_DRIVER_VEHICLES_PATH = concreteRoutePathname('/fleet/drivers/:driverId/vehicles')

describe('trusted frontend origin configuration', () => {
  test.each(['https://spa.example.test', 'https://spa.example.test:5443', FRONTEND_ORIGIN])(
    'accepts one canonical HTTPS origin or HTTP localhost: %s',
    (frontendOrigin) => {
      expect(parseEnvironment(environmentWith(frontendOrigin)).frontendOrigins).toEqual([
        frontendOrigin,
      ])
    },
  )

  test.each([
    undefined,
    '',
    '*',
    'http://spa.example.test',
    'http://127.0.0.1:53000',
    'http://[::1]:53000',
    'http://user:password@localhost:53000',
    'http://localhost:53000/',
    'http://localhost:53000/auth/callback',
    'http://localhost:53000?query=value',
    'http://localhost:53000#fragment',
    'HTTP://localhost:53000',
    'https://SPA.example.test',
  ])('rejects an absent, unsafe or non-canonical origin: %s', (frontendOrigin) => {
    expect(() => parseEnvironment(environmentWith(frontendOrigin))).toThrow()
  })

  test('accepts a comma-separated list — painel and landing are different origins', () => {
    const landingOrigin = 'https://fernandes-transportadora.com.br'
    const environment = environmentWith(`${FRONTEND_ORIGIN},${landingOrigin}`)
    expect(parseEnvironment(environment).frontendOrigins).toEqual([FRONTEND_ORIGIN, landingOrigin])
  })

  test('rejects the list when any single origin in it is untrusted', () => {
    const environment = environmentWith(`${FRONTEND_ORIGIN},http://spa.example.test`)
    expect(() => parseEnvironment(environment)).toThrow()
  })
})

describe('API CORS contract', () => {
  test('answers only the exact /auth/me Bearer GET preflight without authentication', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(preflightRequest(), fixture.server)

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET')
    expect(response.headers.get('access-control-allow-headers')).toBe('Authorization')
    expect(response.headers.get('access-control-max-age')).toBe('300')
    expect(varyValues(response)).toEqual([
      'access-control-request-headers',
      'access-control-request-method',
      'origin',
    ])
    expect(response.headers.has('access-control-allow-credentials')).toBe(true)
    expect(fixture.authenticationCalls()).toBe(0)
    expect(fixture.membershipCalls()).toBe(0)
  })

  test.each([
    ['/private', FRONTEND_ORIGIN, 'GET', 'Authorization'],
    ['/auth/me', OTHER_ORIGIN, 'GET', 'Authorization'],
    ['/auth/me', FRONTEND_ORIGIN, 'POST', 'Authorization'],
    ['/auth/me', FRONTEND_ORIGIN, 'GET', 'Content-Type'],
    ['/auth/me', FRONTEND_ORIGIN, 'GET', 'Authorization, Content-Type'],
    [CTE_BATCH_ITEM_PATH, FRONTEND_ORIGIN, 'PUT', 'Authorization'],
    [CTE_BATCH_ITEM_PATH, FRONTEND_ORIGIN, 'DELETE', 'Authorization, Content-Type'],
    [CTE_BATCH_ITEM_PATH, OTHER_ORIGIN, 'DELETE', 'Authorization'],
  ])(
    'rejects invalid preflight without reflection or protected work: %s %s %s %s',
    async (pathname, origin, requestedMethod, requestedHeaders) => {
      const fixture = createFixture()
      const response = await fixture.handle(
        preflightRequest({ origin, pathname, requestedHeaders, requestedMethod }),
        fixture.server,
      )

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        error: {
          code: 'FORBIDDEN',
          correlationId: CORRELATION_ID,
          message: 'Access denied',
        },
      })
      expect(response.headers.has('access-control-allow-origin')).toBe(false)
      expect(response.headers.has('access-control-allow-methods')).toBe(false)
      expect(response.headers.has('access-control-allow-headers')).toBe(false)
      expect(response.headers.has('access-control-allow-credentials')).toBe(false)
      expect(varyValues(response)).toEqual([
        'access-control-request-headers',
        'access-control-request-method',
        'origin',
      ])
      expect(fixture.authenticationCalls()).toBe(0)
      expect(fixture.membershipCalls()).toBe(0)
      if (pathname === '/auth/me') {
        expect(response.headers.get('cache-control')).toBe('no-store')
      }
    },
  )

  test('parses the requested Authorization header case-insensitively with optional whitespace', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      preflightRequest({ requestedHeaders: ' authorization , AUTHORIZATION ' }),
      fixture.server,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toBe('Authorization')
  })

  test('answers the Bearer DELETE preflight of a CT-e batch item', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      preflightRequest({ pathname: CTE_BATCH_ITEM_PATH, requestedMethod: 'DELETE' }),
      fixture.server,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(response.headers.get('access-control-allow-methods')).toBe('DELETE')
    expect(response.headers.get('access-control-allow-headers')).toBe('Authorization')
    expect(fixture.authenticationCalls()).toBe(0)
  })

  test('answers the idempotent POST preflight of a CT-e item cancellation', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      preflightRequest({
        pathname: `${CTE_BATCH_ITEM_PATH}/cancel`,
        requestedHeaders: 'Authorization, Content-Type, Idempotency-Key',
        requestedMethod: 'POST',
      }),
      fixture.server,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(response.headers.get('access-control-allow-methods')).toBe('POST')
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Authorization, Content-Type, Idempotency-Key',
    )
    expect(fixture.authenticationCalls()).toBe(0)
  })

  test('answers the PATCH preflight of a billing invoice edition', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      preflightRequest({
        pathname: BILLING_INVOICE_PATH,
        requestedHeaders: 'Authorization, Content-Type, Idempotency-Key',
        requestedMethod: 'PATCH',
      }),
      fixture.server,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, PATCH')
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Authorization, Content-Type, Idempotency-Key',
    )
    expect(fixture.authenticationCalls()).toBe(0)
  })

  test.each([
    ['/digital-certificates', 'GET, POST, DELETE'],
    ['/nfe-imports/xml', 'POST'],
  ])(
    'answers the multipart upload preflight without Content-Type: %s',
    async (pathname, allowedMethods) => {
      const fixture = createFixture()
      const response = await fixture.handle(
        preflightRequest({
          pathname,
          requestedHeaders: 'Authorization, Idempotency-Key',
          requestedMethod: 'POST',
        }),
        fixture.server,
      )

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
      expect(response.headers.get('access-control-allow-methods')).toBe(allowedMethods)
      expect(response.headers.get('access-control-allow-headers')).toContain('Idempotency-Key')
      expect(fixture.authenticationCalls()).toBe(0)
    },
  )

  test.each([
    ['/digital-certificates', 'POST', 'Authorization, Idempotency-Key, X-Company-Id'],
    ['/digital-certificates', 'PATCH', 'Authorization, Idempotency-Key'],
    ['/nfe-imports/xml', 'PUT', 'Authorization, Idempotency-Key'],
    ['/company-settings', 'POST', 'Authorization, Idempotency-Key'],
  ])(
    'refuses a multipart-shaped preflight outside the upload boundary: %s %s %s',
    async (pathname, requestedMethod, requestedHeaders) => {
      const fixture = createFixture()
      const response = await fixture.handle(
        preflightRequest({ pathname, requestedHeaders, requestedMethod }),
        fixture.server,
      )

      expect(response.status).toBe(403)
      expect(response.headers.has('access-control-allow-origin')).toBe(false)
      expect(fixture.authenticationCalls()).toBe(0)
    },
  )

  test.each([
    [`${BILLING_INVOICE_PATH}/documents`, 'PATCH', 'Authorization, Content-Type, Idempotency-Key'],
    [`${BILLING_INVOICE_PATH}/cancel`, 'PATCH', 'Authorization, Content-Type, Idempotency-Key'],
    ['/billing/invoices/preview', 'PATCH', 'Authorization, Content-Type, Idempotency-Key'],
    [BILLING_INVOICE_PATH, 'DELETE', 'Authorization'],
  ])(
    'refuses a PATCH preflight outside the invoice edition boundary: %s %s %s',
    async (pathname, requestedMethod, requestedHeaders) => {
      const fixture = createFixture()
      const response = await fixture.handle(
        preflightRequest({ pathname, requestedHeaders, requestedMethod }),
        fixture.server,
      )

      expect(response.status).toBe(403)
      expect(response.headers.has('access-control-allow-methods')).toBe(false)
      expect(fixture.authenticationCalls()).toBe(0)
    },
  )

  // Cadastro de frota escreve pelo navegador: sem o preflight liberado a tela nunca chega à rota
  test.each([
    ['/fleet/vehicles', 'POST', 'GET, POST'],
    [FLEET_VEHICLE_PATH, 'PATCH', 'GET, PATCH'],
    ['/fleet/drivers', 'POST', 'GET, POST'],
    [FLEET_DRIVER_PATH, 'PATCH', 'GET, PATCH'],
    [FLEET_DRIVER_VEHICLES_PATH, 'PUT', 'GET, PUT'],
  ])('answers the fleet write preflight: %s %s', async (pathname, requestedMethod, allowed) => {
    const fixture = createFixture()
    const response = await fixture.handle(
      preflightRequest({
        pathname,
        requestedHeaders: 'Authorization, Content-Type, Idempotency-Key',
        requestedMethod,
      }),
      fixture.server,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(response.headers.get('access-control-allow-methods')).toBe(allowed)
    expect(fixture.authenticationCalls()).toBe(0)
  })

  test.each([
    [FLEET_DRIVER_VEHICLES_PATH, 'DELETE', 'Authorization'],
    [FLEET_DRIVER_PATH, 'PUT', 'Authorization, Content-Type, Idempotency-Key'],
  ])(
    'refuses a fleet preflight outside the registered methods: %s %s',
    async (pathname, requestedMethod, requestedHeaders) => {
      const fixture = createFixture()
      const response = await fixture.handle(
        preflightRequest({ pathname, requestedHeaders, requestedMethod }),
        fixture.server,
      )

      expect(response.status).toBe(403)
      expect(response.headers.has('access-control-allow-methods')).toBe(false)
    },
  )

  test('refuses a DELETE preflight on a CT-e item sub-resource', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      preflightRequest({ pathname: `${CTE_BATCH_ITEM_PATH}/cancel`, requestedMethod: 'DELETE' }),
      fixture.server,
    )

    expect(response.status).toBe(403)
  })

  // O preflight sai da tabela de rotas: módulo novo entra aqui sozinho, sem lista paralela
  test.each(
    [...ROUTE_TABLE, ...ANONYMOUS_ROUTE_TABLE].map((entry) => [entry.method, entry.pathname]),
  )('answers the preflight of every registered route: %s %s', async (method, pathname) => {
    const fixture = createFixture()
    const requestedHeaders =
      method === 'GET' || method === 'DELETE' ? BODYLESS_ALLOW_HEADERS : RESOURCE_ALLOW_HEADERS
    const response = await fixture.handle(
      preflightRequest({
        pathname: concreteRoutePathname(pathname),
        requestedHeaders,
        requestedMethod: method,
      }),
      fixture.server,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(response.headers.get('access-control-allow-methods')?.split(', ')).toContain(method)
    expect(response.headers.get('access-control-allow-headers')).toBe(requestedHeaders)
    expect(fixture.authenticationCalls()).toBe(0)
  })

  test('keeps a plain non-CORS OPTIONS request on the authenticated default path', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      new Request('http://localhost/auth/me', {
        headers: { authorization: 'Bearer header.payload.signature' },
        method: 'OPTIONS',
      }),
      fixture.server,
    )

    expect(response.status).toBe(405)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(fixture.authenticationCalls()).toBe(1)
  })

  test('adds the exact allow origin to actual health and successful auth responses', async () => {
    const fixture = createFixture()
    const health = await fixture.handle(actualRequest('/health/live'), fixture.server)
    const authMe = await fixture.handle(actualRequest('/auth/me'), fixture.server)

    for (const response of [health, authMe]) {
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
      expect(response.headers.has('access-control-allow-credentials')).toBe(true)
      expect(varyValues(response)).toEqual(['origin'])
    }
  })

  test.each([
    [
      401,
      {
        async authenticate() {
          throw new ApiError({
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            status: 401,
          })
        },
      },
      undefined,
      'GET',
    ],
    [
      403,
      undefined,
      {
        async findActiveByUserAndCompany() {
          return null
        },
      },
      'GET',
    ],
    [405, undefined, undefined, 'POST'],
    [
      500,
      {
        async authenticate() {
          throw new Error('identity unavailable')
        },
      },
      undefined,
      'GET',
    ],
  ] as const)(
    'keeps actual /auth/me status %i readable by the allowed SPA',
    async (status, authentication, membership, method) => {
      const fixture = createFixture({
        ...(authentication ? { authentication } : {}),
        ...(membership ? { membership } : {}),
      })
      const response = await fixture.handle(actualRequest('/auth/me', method), fixture.server)

      expect(response.status).toBe(status)
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
      expect(response.headers.has('access-control-allow-credentials')).toBe(true)
      expect(varyValues(response)).toEqual(['origin'])
    },
  )

  test('never allows another origin and preserves clients without Origin', async () => {
    const fixture = createFixture()
    const disallowed = await fixture.handle(
      new Request('http://localhost/health/live', { headers: { origin: OTHER_ORIGIN } }),
      fixture.server,
    )
    const noOrigin = await fixture.handle(
      new Request('http://localhost/health/live'),
      fixture.server,
    )

    expect(disallowed.status).toBe(200)
    expect(noOrigin.status).toBe(200)
    expect(disallowed.headers.has('access-control-allow-origin')).toBe(false)
    expect(noOrigin.headers.has('access-control-allow-origin')).toBe(false)
    expect(varyValues(disallowed)).toEqual(['origin'])
    expect(varyValues(noOrigin)).toEqual(['origin'])
  })

  test('does not log Origin or Authorization values', async () => {
    const fixture = createFixture()
    await fixture.handle(
      new Request('http://localhost/auth/me', {
        headers: {
          authorization: 'Bearer sensitive.header.value',
          origin: FRONTEND_ORIGIN,
        },
      }),
      fixture.server,
    )

    const serializedLogs = JSON.stringify(fixture.logs)
    expect(serializedLogs).not.toContain(FRONTEND_ORIGIN)
    expect(serializedLogs).not.toContain('sensitive.header.value')
  })

  describe('with a second trusted origin (painel and landing)', () => {
    const LANDING_ORIGIN = 'https://fernandes-transportadora.com.br'

    test('reflects whichever of the two origins actually asked, on preflight and on the real request', async () => {
      const fixture = createFixture({ frontendOrigins: [FRONTEND_ORIGIN, LANDING_ORIGIN] })

      const panelPreflight = await fixture.handle(
        preflightRequest({ origin: FRONTEND_ORIGIN }),
        fixture.server,
      )
      const landingPreflight = await fixture.handle(
        preflightRequest({ origin: LANDING_ORIGIN }),
        fixture.server,
      )
      const panelRequest = await fixture.handle(
        new Request('http://localhost/auth/me', {
          headers: { authorization: 'Bearer header.payload.signature', origin: FRONTEND_ORIGIN },
        }),
        fixture.server,
      )
      const landingRequest = await fixture.handle(
        new Request('http://localhost/auth/me', {
          headers: { authorization: 'Bearer header.payload.signature', origin: LANDING_ORIGIN },
        }),
        fixture.server,
      )

      expect(panelPreflight.status).toBe(204)
      expect(panelPreflight.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
      expect(landingPreflight.status).toBe(204)
      expect(landingPreflight.headers.get('access-control-allow-origin')).toBe(LANDING_ORIGIN)
      expect(panelRequest.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
      expect(landingRequest.headers.get('access-control-allow-origin')).toBe(LANDING_ORIGIN)
    })

    test('still rejects an origin outside both trusted ones', async () => {
      const fixture = createFixture({ frontendOrigins: [FRONTEND_ORIGIN, LANDING_ORIGIN] })
      const response = await fixture.handle(
        preflightRequest({ origin: OTHER_ORIGIN }),
        fixture.server,
      )
      expect(response.status).toBe(403)
    })
  })
})

type CreateFixtureParams = {
  readonly authentication?: AuthenticationPort
  readonly frontendOrigins?: readonly [string, ...string[]]
  readonly membership?: MembershipRepositoryPort
}

function createFixture({
  authentication,
  frontendOrigins = [FRONTEND_ORIGIN],
  membership,
}: CreateFixtureParams = {}) {
  let authenticationCallCount = 0
  let membershipCallCount = 0
  const logs: Array<Record<string, unknown>> = []
  const authenticationFixture: AuthenticationPort = {
    async authenticate(header) {
      authenticationCallCount += 1
      if (authentication) {
        return authentication.authenticate(header)
      }
      return {
        companyIdClaim: '00000000-0000-4000-8000-000000000001',
        externalIdentityId: '00000000-0000-4000-8000-000000000002',
        issuer: 'https://identity.example.test/realms/transportada',
        platformAdmin: false,
        subject: 'cors-user',
        userId: '00000000-0000-4000-8000-000000000003',
      }
    },
  }
  const membershipFixture: MembershipRepositoryPort = {
    async findActiveByUserAndCompany(input) {
      membershipCallCount += 1
      if (membership) {
        return membership.findActiveByUserAndCompany(input)
      }
      return {
        membershipId: '00000000-0000-4000-8000-000000000004',
        roles: ['viewer'],
      }
    },
  }
  const logger: ApiLogger = {
    error(_message, metadata) {
      logs.push(metadata ?? {})
    },
    info(_message, metadata) {
      logs.push(metadata ?? {})
    },
    warn(_message, metadata) {
      logs.push(metadata ?? {})
    },
  }
  const healthService = new HealthService({
    database: healthyDatabase(),
    identityReadiness: {
      async checkReadiness() {
        return true
      },
    },
    migrationStatus: appliedMigrations(),
  })
  const tenantContext = new TenantContextService({ repository: membershipFixture })
  const handle = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins,
    logger,
    requestTimeoutSeconds: 10,
    router: createHttpRouterFixture({
      anonymousRoutes: createAnonymousRouteTableFixture(),
      authentication: authenticationFixture,
      healthService,
      routes: createRouteTableFixture(),
      tenantContext,
    }),
  })
  const server: RequestTimeoutPort = { timeout() {} }

  return {
    authenticationCalls: () => authenticationCallCount,
    handle,
    logs,
    membershipCalls: () => membershipCallCount,
    server,
  }
}

function environmentWith(frontendOrigin: string | undefined): Record<string, string | undefined> {
  return {
    APP_ENV: 'test',
    APP_PORT: '0',
    DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
    FRONTEND_ORIGIN: frontendOrigin,
    KEYCLOAK_ADMIN_CLIENT_ID: 'transportada-admin-cli',
    KEYCLOAK_ADMIN_CLIENT_SECRET: 'test-keycloak-admin-client-secret',
    KEYCLOAK_AUDIENCE: 'transportada-api',
    KEYCLOAK_ISSUER: 'https://identity.example.test/realms/transportada',
    KEYCLOAK_JWKS_URI: 'https://identity.example.test/realms/transportada/certs',
    LOG_LEVEL: 'error',
    ...CRYPTOGRAPHIC_ENVIRONMENT,
  }
}

function preflightRequest({
  origin = FRONTEND_ORIGIN,
  pathname = '/auth/me',
  requestedHeaders = 'Authorization',
  requestedMethod = 'GET',
}: {
  readonly origin?: string
  readonly pathname?: string
  readonly requestedHeaders?: string
  readonly requestedMethod?: string
} = {}): Request {
  return new Request(`http://localhost${pathname}`, {
    headers: {
      'access-control-request-headers': requestedHeaders,
      'access-control-request-method': requestedMethod,
      origin,
    },
    method: 'OPTIONS',
  })
}

function actualRequest(pathname: string, method = 'GET'): Request {
  return new Request(`http://localhost${pathname}`, {
    headers: {
      authorization: 'Bearer header.payload.signature',
      origin: FRONTEND_ORIGIN,
    },
    method,
  })
}

function varyValues(response: Response): readonly string[] {
  return (response.headers.get('vary') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort()
}

function healthyDatabase(): DatabaseHealthPort {
  return {
    async close() {},
    async healthCheck() {
      return { healthy: true }
    },
  }
}
