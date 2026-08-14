/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from '../fixtures/health.fixture'
import type { AuthenticationPort } from '../../src/identity/application/identity.port'
import { TenantContextService } from '../../src/identity/application/tenant-context.service'
import { startApiServer } from '../../src/server/server.service'
import type { ApiLogger } from '../../src/shared/api.types'
import { DEFAULT_SCHEDULED_DISTRIBUTION_CRON } from '../../src/config/scheduled-distribution.constant'
import { CRYPTOGRAPHIC_CONFIGURATION } from '../fixtures/cryptographic-environment.fixture'
import { createHttpRouterFixture } from '../fixtures/http-router.fixture'

const databaseUrl = process.env.API_TEST_DATABASE_URL ?? process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('API_TEST_DATABASE_URL or DATABASE_URL is required for the API integration test')
}

const database = createDrizzleProvider({ connection: databaseUrl })
const logger: ApiLogger = {
  error() {},
  info() {},
  warn() {},
}
let identityReadinessChecks = 0
const healthService = new HealthService({
  database,
  identityReadiness: {
    async checkReadiness() {
      identityReadinessChecks += 1
      return true
    },
  },
  migrationStatus: appliedMigrations(),
})
const authentication: AuthenticationPort = {
  async authenticate() {
    return {
      companyIdClaim: '00000000-0000-4000-8000-000000000001',
      externalIdentityId: '00000000-0000-4000-8000-000000000002',
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      subject: 'integration-user',
      userId: '00000000-0000-4000-8000-000000000003',
    }
  },
}
const tenantContext = new TenantContextService({
  repository: {
    async findActiveByUserAndCompany() {
      return { membershipId: '00000000-0000-4000-8000-000000000004', roles: [] }
    },
  },
})
const server = startApiServer({
  config: {
    appEnv: 'test',
    bootstrapToken: undefined,
    companyId: undefined,
    cryptography: CRYPTOGRAPHIC_CONFIGURATION,
    databaseUrl,
    emailDelivery: undefined,
    frontendOrigin: 'http://localhost:53000',
    keycloak: {
      admin: {
        clientId: 'transportada-admin-cli',
        clientSecret: 'test-keycloak-admin-client-secret',
      },
      audience: 'transportada-api',
      issuer: 'http://localhost:58080/realms/transportada-local',
      jwksUri: 'http://localhost:58080/realms/transportada-local/protocol/openid-connect/certs',
    },
    logLevel: 'error',
    nfseCallbackBaseUrl: undefined,
    notificationWebhookSecret: undefined,
    port: 0,
    scheduledDistributionCron: DEFAULT_SCHEDULED_DISTRIBUTION_CRON,
    logSinkUrl: undefined,
    sentryDsn: undefined,
    sentryEnvironment: 'test',
    vehicleCatalog: null,
    vehicleLookup: null,
  },
  logger,
  router: createHttpRouterFixture({ authentication, healthService, tenantContext }),
})
const baseUrl = `http://127.0.0.1:${server.port}`

beforeAll(async () => {
  await database.healthCheck()
})

afterAll(async () => {
  await server.stop()
  await database.close()
})

describe('API server integration', () => {
  test('serves liveness and PostgreSQL readiness on an ephemeral port', async () => {
    expect(identityReadinessChecks).toBe(0)
    const live = await fetch(`${baseUrl}/health/live`)
    expect(identityReadinessChecks).toBe(0)
    const ready = await fetch(`${baseUrl}/health/ready`)

    expect(server.port).toBeGreaterThan(0)
    expect(live.status).toBe(200)
    expect(live.headers.get('x-correlation-id')).toBeTruthy()
    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({
      dependencies: { database: 'up', identity: 'up' },
      status: 'ok',
    })
    expect(identityReadinessChecks).toBe(1)
  })

  test('rejects request bodies over the application limit with a correlated error', async () => {
    const response = await fetch(`${baseUrl}/health/live`, {
      body: 'x'.repeat(1_048_577),
      headers: { 'x-correlation-id': 'oversized-request' },
      method: 'POST',
    })

    expect(response.status).toBe(413)
    expect(response.headers.get('x-correlation-id')).toBe('oversized-request')
    expect(await response.json()).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        correlationId: 'oversized-request',
        message: 'Request body too large',
      },
    })
  })

  test('serves the strict auth preflight and authenticated cross-origin request through Bun', async () => {
    const preflight = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        'access-control-request-headers': 'Authorization',
        'access-control-request-method': 'GET',
        origin: 'http://localhost:53000',
      },
      method: 'OPTIONS',
    })
    const authMe = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        authorization: 'Bearer integration-token',
        origin: 'http://localhost:53000',
      },
    })

    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:53000')
    expect(preflight.headers.get('cache-control')).toBe('no-store')
    expect(authMe.status).toBe(200)
    expect(authMe.headers.get('access-control-allow-origin')).toBe('http://localhost:53000')
  })

  test('drains and exits cleanly on SIGTERM', async () => {
    const child = Bun.spawn({
      cmd: [process.execPath, './test/fixtures/signal-server.fixture.ts'],
      cwd: new URL('../..', import.meta.url).pathname,
      env: {
        ...process.env,
        APP_ENV: 'test',
        APP_PORT: '0',
        DATABASE_URL: databaseUrl,
        FRONTEND_ORIGIN: 'http://localhost:53000',
        KEYCLOAK_AUDIENCE: 'transportada-api',
        KEYCLOAK_ISSUER: 'http://localhost:58080/realms/transportada-local',
        KEYCLOAK_JWKS_URI:
          'http://localhost:58080/realms/transportada-local/protocol/openid-connect/certs',
        LOG_LEVEL: 'error',
      },
      stderr: 'pipe',
      stdout: 'pipe',
    })
    const stdout = child.stdout

    if (typeof stdout === 'number') {
      throw new Error('Expected subprocess stdout pipe')
    }

    await waitForReady(stdout)
    child.kill('SIGTERM')

    expect(await child.exited).toBe(0)
  })
})

async function waitForReady(stdout: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stdout.getReader()
  const decoder = new TextDecoder()
  let output = ''

  while (!output.includes('API_TEST_READY:')) {
    const result = await reader.read()
    if (result.done) {
      throw new Error(`API subprocess exited before readiness: ${output}`)
    }
    output += decoder.decode(result.value, { stream: true })
  }

  reader.releaseLock()
}
