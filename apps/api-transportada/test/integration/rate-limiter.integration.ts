/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T406: o teto só é teto se duas réplicas contarem na mesma linha ao mesmo tempo. Isso é
 * propriedade do `INSERT … ON CONFLICT` do banco, e só se prova contra um Postgres de verdade.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { DrizzleRateLimiterRepository } from '../../src/http/drizzle-rate-limiter.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SCOPE = 'contractor-mail'
const MAX_REQUESTS = 20
const WINDOW_SECONDS = 3_600

function subjectKey(): string {
  return `${crypto.randomUUID()}:${crypto.randomUUID()}`
}

describeDatabase('limitador com estado no Postgres (spec 150 T406)', () => {
  const databaseName = `transportada_150_t406_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined

  function db(): TestDatabase['db'] {
    if (database === undefined) throw new Error('A disposable database is required')
    return database.db
  }

  function limiter(): DrizzleRateLimiterRepository {
    return new DrizzleRateLimiterRepository(db())
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
        await admin?.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin?.close({ timeout: 0 })
      }
    }
  })

  test('30 pedidos simultâneos: exatamente o teto passa, o resto espera a janela virar', async () => {
    const subject = subjectKey()

    const outcomes = await Promise.all(
      Array.from({ length: 30 }, () =>
        limiter().consume({
          maxRequests: MAX_REQUESTS,
          scope: SCOPE,
          subjectKey: subject,
          windowSeconds: WINDOW_SECONDS,
        }),
      ),
    )

    const allowed = outcomes.filter((outcome) => outcome.allowed)
    const refused = outcomes.filter((outcome) => !outcome.allowed)
    expect(allowed).toHaveLength(MAX_REQUESTS)
    expect(refused).toHaveLength(10)
    for (const outcome of refused) {
      if (outcome.allowed) continue
      expect(outcome.retryAfterSeconds).toBeGreaterThanOrEqual(1)
      expect(outcome.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_SECONDS)
    }

    const rows = await db().execute(sql`
      select hits from rate_limit_windows where scope = ${SCOPE} and subject_key = ${subject}
    `)
    expect(rows.map((row) => Number(row.hits))).toEqual([30])
  })

  /** A janela é a do relógio do banco: a linha da janela passada não conta na janela de agora. */
  test('a virada da janela zera o balde', async () => {
    const subject = subjectKey()
    await db().execute(sql`
      insert into rate_limit_windows (scope, subject_key, window_start, hits)
      values (
        ${SCOPE}, ${subject},
        to_timestamp(floor(extract(epoch from now()) / ${WINDOW_SECONDS}::integer) * ${WINDOW_SECONDS}::integer)
          - make_interval(secs => ${WINDOW_SECONDS}::integer),
        ${MAX_REQUESTS + 5}
      )
    `)

    const outcome = await limiter().consume({
      maxRequests: MAX_REQUESTS,
      scope: SCOPE,
      subjectKey: subject,
      windowSeconds: WINDOW_SECONDS,
    })

    expect(outcome).toEqual({ allowed: true })
    const rows = await db().execute(sql`
      select hits from rate_limit_windows
      where scope = ${SCOPE} and subject_key = ${subject}
      order by window_start
    `)
    expect(rows.map((row) => Number(row.hits))).toEqual([MAX_REQUESTS + 5, 1])
  })

  test('outro usuário e outro escopo têm balde próprio', async () => {
    const subject = subjectKey()
    const consume = (input: { readonly scope: string; readonly subject: string }) =>
      limiter().consume({
        maxRequests: 1,
        scope: input.scope,
        subjectKey: input.subject,
        windowSeconds: WINDOW_SECONDS,
      })

    expect(await consume({ scope: SCOPE, subject })).toEqual({ allowed: true })
    expect((await consume({ scope: SCOPE, subject })).allowed).toBe(false)
    expect(await consume({ scope: 'another-scope', subject })).toEqual({ allowed: true })
    expect(await consume({ scope: SCOPE, subject: subjectKey() })).toEqual({ allowed: true })
  })
})
