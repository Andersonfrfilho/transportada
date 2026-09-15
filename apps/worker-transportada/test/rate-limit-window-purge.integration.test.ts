/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A limpeza das janelas do limitador contra Postgres de verdade: a chave é composta e o lote sai por
 * `ctid`, então só o banco prova que sai a linha certa e fica a que ainda conta.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { JobRoutineContext } from '../src/job-run/application/job-routine.port.js'
import { createRateLimitWindowPurgeRoutine } from '../src/rate-limit-window-purge/application/rate-limit-window-purge.routine.js'
import { createDrizzlePurgeExpiredRateLimitWindows } from '../src/rate-limit-window-purge/infrastructure/drizzle-rate-limit-window-purge.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const SILENT_LOGGER = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

const CONTEXT: JobRoutineContext = {
  correlationId: 'rate-limit-window-purge-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'rate-limit.window.purge',
  origin: 'schedule',
}

describeDatabase('limpeza das janelas do limitador (integration)', () => {
  const scope = `purge-test-${crypto.randomUUID()}`
  const expiredSubject = `${crypto.randomUUID()}:${crypto.randomUUID()}`
  const recentSubject = `${crypto.randomUUID()}:${crypto.randomUUID()}`

  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db

  async function insertWindow(input: { readonly hoursAgo: number; readonly subject: string }) {
    await db.execute(sql`
      insert into rate_limit_windows (scope, subject_key, window_start, hits)
      values (${scope}, ${input.subject}, now() - make_interval(hours => ${input.hoursAgo}::integer), 3)
    `)
  }

  beforeAll(async () => {
    await insertWindow({ hoursAgo: 49, subject: expiredSubject })
    await insertWindow({ hoursAgo: 72, subject: expiredSubject })
    await insertWindow({ hoursAgo: 47, subject: recentSubject })
    await insertWindow({ hoursAgo: 0, subject: recentSubject })
  })

  afterAll(async () => {
    await db.execute(sql`delete from rate_limit_windows where scope = ${scope}`)
    await provider.close()
  })

  function buildRoutine() {
    return createRateLimitWindowPurgeRoutine({
      logger: SILENT_LOGGER as never,
      now: () => new Date(),
      purge: createDrizzlePurgeExpiredRateLimitWindows(db),
    })
  }

  test('apaga a janela vencida há mais de 24 h e deixa as que ainda podem contar', async () => {
    const result = await buildRoutine().run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(result.counters.deleted).toBeGreaterThanOrEqual(2)

    const remaining = await db.execute(sql`
      select subject_key from rate_limit_windows where scope = ${scope}
    `)
    expect(remaining.map((row) => String(row.subject_key))).toEqual([recentSubject, recentSubject])
  })

  test('o segundo ciclo não encontra mais nada deste escopo para apagar', async () => {
    await buildRoutine().run(CONTEXT)

    const remaining = await db.execute(sql`
      select count(*)::int as total from rate_limit_windows where scope = ${scope}
    `)
    expect(Number(remaining[0]?.total)).toBe(2)
  })
})
