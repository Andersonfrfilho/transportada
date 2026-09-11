/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { createDatabaseProvider } from '../src/database/database-client.service'
import { DATABASE_UNAVAILABLE_REASON } from '../src/database/database-pool.constant'
import {
  DatabaseUnavailableError,
  findDatabaseFailure,
} from '../src/database/database-unavailable.error'
import { HealthService } from '../src/health/health.service'
import { createRequestHandler } from '../src/http/request-handler.service'
import type { AuthenticationPort } from '../src/identity/application/identity.port'
import { TenantContextService } from '../src/identity/application/tenant-context.service'
import { HTTP_ERROR } from '../src/shared/api.constant'
import type { ApiLogger, RequestTimeoutPort } from '../src/shared/api.types'
import { createHttpRouterFixture } from './fixtures/http-router.fixture'

/**
 * Spec 137: banco que não entrega conexão nem consulta vira 503 com código estável e log — nunca
 * o socket fechado mudo dos 10 s do `server.timeout` que o incidente de 11/09/2026 produziu.
 *
 * Sem Postgres: a porta silenciosa aceita o TCP e não responde nada, que é, visto do cliente, o
 * pool preso; a porta fechada é o banco fora do ar. O caso do pedido abortado precisa de Postgres
 * de verdade e mora em `test/integration/database-availability.integration.ts`.
 */
const QUERY_TIMEOUT_MS = 300
const READINESS_TIMEOUT_MS = 250
const SLACK_MS = 400

let silentListener: { stop(closeActiveConnections?: boolean): void } | undefined
let silentUrl = ''
let closedUrl = ''

beforeAll(() => {
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: { data() {}, open() {} },
  })
  silentListener = listener
  silentUrl = `postgres://contract:contract@127.0.0.1:${listener.port}/contract`
  const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } })
  closedUrl = `postgres://contract:contract@127.0.0.1:${probe.port}/contract`
  probe.stop(true)
})

afterAll(() => {
  silentListener?.stop(true)
})

function providerFor(url: string) {
  return createDatabaseProvider({
    pool: { connectTimeoutSeconds: 1, max: 1, queryTimeoutMs: QUERY_TIMEOUT_MS },
    url,
  })
}

describe('database availability (spec 137)', () => {
  test('a database that accepts TCP and never answers fails inside the query deadline', async () => {
    const provider = providerFor(silentUrl)
    const startedAt = performance.now()
    const failure = await provider.db.execute(sql`select 1`).then(
      () => undefined,
      (error: unknown) => findDatabaseFailure(error),
    )
    const elapsedMs = performance.now() - startedAt

    expect(failure).toBeInstanceOf(DatabaseUnavailableError)
    expect((failure as DatabaseUnavailableError).reason).toBe(
      DATABASE_UNAVAILABLE_REASON.queryTimeout,
    )
    expect(elapsedMs).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS)
    void provider.close()
  })

  test('a closed port is reported as connection failure, not as an unknown 500', async () => {
    const provider = providerFor(closedUrl)
    const failure = await provider.healthCheck().then(
      () => undefined,
      (error: unknown) => findDatabaseFailure(error),
    )

    expect(failure).toBeInstanceOf(DatabaseUnavailableError)
    expect(Object.values(DATABASE_UNAVAILABLE_REASON)).toContain(
      (failure as DatabaseUnavailableError).reason,
    )
    void provider.close()
  })

  test('an authenticated route answers 503 DATABASE_UNAVAILABLE and logs why', async () => {
    const provider = providerFor(silentUrl)
    const fixture = createFixture(provider)
    const startedAt = performance.now()

    const response = await fixture.handle(
      new Request('http://localhost/fleet/vehicles', {
        headers: { authorization: 'Bearer contract', 'x-correlation-id': 'db-down-1' },
      }),
      fixture.server,
    )
    const elapsedMs = performance.now() - startedAt

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: {
        code: HTTP_ERROR.databaseUnavailable.code,
        correlationId: 'db-down-1',
        message: HTTP_ERROR.databaseUnavailable.message,
      },
    })
    expect(elapsedMs).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS)
    expect(fixture.errors).toContainEqual({
      message: 'database_unavailable',
      metadata: { correlationId: 'db-down-1', reason: DATABASE_UNAVAILABLE_REASON.queryTimeout },
    })
    void provider.close()
  })

  test('/health/ready answers 503 inside the readiness window instead of hanging', async () => {
    const provider = providerFor(silentUrl)
    const fixture = createFixture(provider)
    const startedAt = performance.now()

    const response = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )
    const elapsedMs = performance.now() - startedAt

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ dependencies: { database: 'down' } })
    expect(elapsedMs).toBeLessThan(READINESS_TIMEOUT_MS + SLACK_MS)
    void provider.close()
  })
})

function createFixture(provider: ReturnType<typeof createDatabaseProvider>) {
  const errors: Array<{ message: string; metadata: Record<string, unknown> | undefined }> = []
  const logger: ApiLogger = {
    error(message, metadata) {
      errors.push({ message, metadata })
    },
    info() {},
    warn() {},
  }
  const authentication: AuthenticationPort = {
    async authenticate() {
      return {
        companyIdClaim: '00000000-0000-4000-8000-000000000001',
        externalIdentityId: '00000000-0000-4000-8000-000000000002',
        issuer: 'http://localhost:58080/realms/transportada-local',
        platformAdmin: false,
        serviceAccount: false,
        subject: 'contract-user',
        userId: '00000000-0000-4000-8000-000000000003',
      }
    },
  }
  // O caminho do incidente: token válido, e a primeira ida ao banco é resolver a empresa.
  const tenantContext = new TenantContextService({
    repository: {
      async findActiveByUserAndCompany() {
        await provider.db.execute(sql`select 1`)
        return null
      },
    },
  })
  const healthService = new HealthService({
    database: provider,
    identityReadiness: { checkReadiness: async () => true },
    migrationStatus: { countPending: async () => 0 },
    readinessTimeoutMs: READINESS_TIMEOUT_MS,
  })
  const handle = createRequestHandler({
    frontendOrigins: ['http://localhost:53000'],
    logger,
    requestTimeoutSeconds: 10,
    router: createHttpRouterFixture({
      authentication,
      healthService,
      // A rota nunca executa: a empresa é resolvida antes, e é ali que o banco é consultado.
      routes: [
        {
          async execute() {
            return new Response(null, { status: 204 })
          },
          method: 'GET',
          pathname: '/fleet/vehicles',
        },
      ],
      tenantContext,
    }),
  })
  const server: RequestTimeoutPort = { timeout() {} }

  return { errors, handle, server }
}
