/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { HealthService } from '../../src/health/health.service'
import type { AuthenticationPort } from '../../src/identity/application/identity.port'
import { TenantContextService } from '../../src/identity/application/tenant-context.service'
import { startApiServer } from '../../src/server/server.service'
import type { ApiLogger } from '../../src/shared/api.types'

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
const healthService = new HealthService({ database })
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
const server = startApiServer({
  authentication,
  config: {
    appEnv: 'test',
    databaseUrl,
    keycloak: {
      audience: 'transportada-api',
      issuer: 'http://localhost:58080/realms/transportada-local',
      jwksUri: 'http://localhost:58080/realms/transportada-local/protocol/openid-connect/certs',
    },
    logLevel: 'error',
    port: 0,
  },
  healthService,
  logger,
  tenantContext: new TenantContextService({
    repository: {
      async findActiveByUserAndCompany() {
        return { membershipId: '00000000-0000-4000-8000-000000000004', roles: [] }
      },
    },
  }),
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
    const live = await fetch(`${baseUrl}/health/live`)
    const ready = await fetch(`${baseUrl}/health/ready`)

    expect(server.port).toBeGreaterThan(0)
    expect(live.status).toBe(200)
    expect(live.headers.get('x-correlation-id')).toBeTruthy()
    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({
      dependencies: { database: 'up' },
      status: 'ok',
    })
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

  test('drains and exits cleanly on SIGTERM', async () => {
    const child = Bun.spawn({
      cmd: [process.execPath, './test/fixtures/signal-server.fixture.ts'],
      cwd: new URL('../..', import.meta.url).pathname,
      env: {
        ...process.env,
        APP_ENV: 'test',
        APP_PORT: '0',
        DATABASE_URL: databaseUrl,
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
