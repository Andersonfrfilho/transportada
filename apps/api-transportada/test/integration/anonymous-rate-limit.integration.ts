/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 191 RF12, ADR-0076 §3: o teto da rota anônima vale somado entre réplicas. Cada roteador tem o
 * próprio balde em memória — é o Postgres que soma. Dois roteadores sobre o mesmo banco, o mesmo IP
 * alternando entre eles: o 11º pedido leva 429, embora nenhuma réplica sozinha tenha visto 11.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { HealthService } from '../../src/health/health.service.js'
import {
  createClientIpResolver,
  DEFAULT_CLIENT_IP_POLICY,
} from '../../src/http/client-ip.service.js'
import { DrizzleRateLimiterRepository } from '../../src/http/drizzle-rate-limiter.repository.js'
import { createRateLimitSubjectService } from '../../src/http/rate-limit-subject.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { createPasswordResetRoutes } from '../../src/identity/presentation/password-reset.routes.js'
import { IDENTITY_RATE_LIMIT_DEFAULTS } from '../../src/identity/shared/identity-rate-limit.constant.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const CLIENT_IP = '198.51.100.77'
/**
 * O teto padrão do IP no pedido de recuperação (10), com a janela de um dia: a janela do Postgres é
 * alinhada à época, e uma de 15 min poderia virar no meio do teste.
 */
const IP_CEILING = {
  maxRequests: IDENTITY_RATE_LIMIT_DEFAULTS.passwordResetsIp.maxRequests,
  windowSeconds: 86_400,
} as const

const NOT_CALLED = () => {
  throw new Error('ROUTER_DEPENDENCY_NOT_EXPECTED')
}

describeDatabase('limitador anônimo somado entre réplicas (spec 191 T1.3)', () => {
  const databaseName = `transportada_191_t13_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined

  function db(): TestDatabase['db'] {
    if (database === undefined) throw new Error('A disposable database is required')
    return database.db
  }

  /** Uma réplica: roteador, balde em memória e resolvedor próprios; só o banco é compartilhado. */
  function replica() {
    return createRouter({
      anonymousRoutes: createPasswordResetRoutes({
        confirmPasswordReset: { execute: NOT_CALLED },
        rateLimits: {
          confirmIp: IP_CEILING,
          requestIp: IP_CEILING,
          requestTarget: IDENTITY_RATE_LIMIT_DEFAULTS.passwordResetsTarget,
        },
        requestPasswordReset: { execute: async () => undefined },
      }),
      authentication: { authenticate: NOT_CALLED },
      authorization: { authorize: NOT_CALLED },
      companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
      healthService: new HealthService({
        database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
        identityReadiness: { checkReadiness: async () => true },
        migrationStatus: appliedMigrations(),
      }),
      rateLimitSubjects: createRateLimitSubjectService({
        key: Uint8Array.from(Buffer.alloc(32, 11)),
      }),
      rateLimitWindows: new DrizzleRateLimiterRepository(db()),
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      routes: [],
      tenantContext: { resolveCompany: NOT_CALLED },
      userPictureExistence: stubUserPictureExistence(),
    })
  }

  async function statusOf(input: {
    readonly router: ReturnType<typeof replica>
    readonly username: string
  }): Promise<number> {
    try {
      const response = await input.router.handle({
        correlationId: 'anonymous-rate-limit-integration',
        method: 'POST',
        pathname: '/password-resets',
        request: new Request('http://localhost/password-resets', {
          body: JSON.stringify({ username: input.username }),
          headers: { 'content-type': 'application/json', 'x-real-ip': CLIENT_IP },
          method: 'POST',
        }),
      })
      return response.status
    } catch (error: unknown) {
      return (error as { readonly status?: number }).status ?? 500
    }
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
  })

  afterAll(async () => {
    try {
      await database?.close()
    } finally {
      try {
        // Disposable database identifiers cannot be parameterized.
        await admin?.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin?.close({ timeout: 0 })
      }
    }
  })

  test('dois roteadores sobre o mesmo banco somam o teto: o 11º pedido do mesmo IP dá 429', async () => {
    const replicas = [replica(), replica()] as const
    const statuses: number[] = []

    for (let attempt = 0; attempt < 11; attempt += 1) {
      // Alvo diferente a cada pedido: quem barra aqui tem de ser o IP, não o alvo.
      statuses.push(
        await statusOf({
          router: replicas[attempt % 2]!,
          username: `pessoa.sintetica.${attempt}`,
        }),
      )
    }

    expect(statuses.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 204))
    expect(statuses[10]).toBe(429)
  })

  test('a tabela guarda só HMAC: nem o IP nem o texto digitado aparecem em claro', async () => {
    const rows = await db().execute<{ readonly scope: string; readonly subject_key: string }>(
      sql`select scope, subject_key from rate_limit_windows`,
    )

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.subject_key).toMatch(/^(ip|target):[A-Za-z0-9_-]{43}$/)
      expect(row.subject_key).not.toContain(CLIENT_IP)
      expect(row.subject_key).not.toContain('pessoa')
    }
    expect(new Set(rows.map((row) => row.scope))).toEqual(
      new Set(['password-resets-ip', 'password-resets-target']),
    )
  })
})
