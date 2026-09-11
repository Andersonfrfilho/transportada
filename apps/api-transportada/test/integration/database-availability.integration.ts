/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service'
import { DATABASE_UNAVAILABLE_REASON } from '../../src/database/database-pool.constant'
import {
  DatabaseQueryAbortedError,
  DatabaseUnavailableError,
  findDatabaseFailure,
} from '../../src/database/database-unavailable.error'
import { runInRequestScope } from '../../src/shared/request-scope.service'

const databaseUrl = process.env.API_TEST_DATABASE_URL ?? process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('API_TEST_DATABASE_URL or DATABASE_URL is required for the API integration test')
}

/**
 * Spec 137 contra Postgres de verdade, com pool de **uma** conexão: é o tamanho em que uma única
 * consulta presa derruba tudo, e por isso o que prova que nada fica preso.
 */
const QUERY_TIMEOUT_MS = 600
const provider = createDatabaseProvider({
  pool: { connectTimeoutSeconds: 5, max: 1, queryTimeoutMs: QUERY_TIMEOUT_MS },
  url: databaseUrl,
})

afterAll(async () => {
  await provider.close()
})

describe('database availability against PostgreSQL (spec 137)', () => {
  test('a query past the deadline is cut by the server and the connection is reused', async () => {
    const startedAt = performance.now()
    const failure = await provider.db.execute(sql`select pg_sleep(5)`).then(
      () => undefined,
      (error: unknown) => findDatabaseFailure(error),
    )

    expect(failure).toBeInstanceOf(DatabaseUnavailableError)
    expect((failure as DatabaseUnavailableError).reason).toBe(
      DATABASE_UNAVAILABLE_REASON.queryTimeout,
    )
    expect(performance.now() - startedAt).toBeLessThan(QUERY_TIMEOUT_MS + 500)
    await expect(provider.healthCheck()).resolves.toEqual({ healthy: true })
  })

  test('a pool held by a slow query answers the next caller with 503 inside the deadline', async () => {
    const holder = provider.db.execute(sql`select pg_sleep(0.5)`)
    const startedAt = performance.now()
    const waiting = await provider.db.execute(sql`select 1`).then(
      () => 'answered' as const,
      (error: unknown) => findDatabaseFailure(error),
    )
    await holder.catch(() => undefined)

    // Ou a espera coube no prazo e a consulta respondeu, ou ela foi recusada no prazo — nunca pendura.
    expect(performance.now() - startedAt).toBeLessThan(QUERY_TIMEOUT_MS + 500)
    if (waiting !== 'answered') expect(waiting).toBeInstanceOf(DatabaseUnavailableError)
    await expect(provider.healthCheck()).resolves.toEqual({ healthy: true })
  })

  test('twenty requests whose client already left never reach the database', async () => {
    // Sinal já abortado quando o caso de uso chega ao banco: a consulta preguiçosa nem nasce, e a
    // única conexão fica livre na hora. (Abortar "logo depois" não é determinístico: a primeira
    // consulta pode já estar no fio, e aí o caso é o do teste seguinte.)
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () =>
        runInRequestScope({ signal: AbortSignal.abort() }, async () => {
          try {
            await provider.db.execute(sql`select pg_sleep(0.2)`)
            return undefined
          } catch (error: unknown) {
            return findDatabaseFailure(error)
          }
        }),
      ),
    )

    expect(outcomes.filter((outcome) => outcome instanceof DatabaseQueryAbortedError).length).toBe(
      20,
    )
    const startedAt = performance.now()
    await expect(provider.healthCheck()).resolves.toEqual({ healthy: true })
    expect(performance.now() - startedAt).toBeLessThan(QUERY_TIMEOUT_MS)
  })

  test('twenty aborted requests with one already running: the connection comes back', async () => {
    // Uma roda na única conexão e as outras já foram enviadas: o `cancel()` do Bun não as tira, e o
    // que devolve a conexão é elas terminarem — 20 × 0,05 s aqui, e nunca além do prazo cada uma.
    const outcomes = await abortTwenty({ abortAfterMs: 20, sleepSeconds: 0.05 })

    expect(outcomes.filter((outcome) => outcome instanceof DatabaseQueryAbortedError).length).toBe(
      20,
    )
    await expect(waitUntilHealthy(20 * QUERY_TIMEOUT_MS)).resolves.toBe(true)
  })
})

type AbortTwentyParams = { readonly abortAfterMs: number; readonly sleepSeconds: number }

// O drizzle é preguiçoso: a consulta só nasce no `await`, e ele tem de acontecer dentro do escopo
// do pedido — é assim que o `request-handler` chama o roteador.
async function abortTwenty({ abortAfterMs, sleepSeconds }: AbortTwentyParams): Promise<unknown[]> {
  const controllers = Array.from({ length: 20 }, () => new AbortController())
  const pending = controllers.map((controller) =>
    runInRequestScope({ signal: controller.signal }, async () => {
      try {
        await provider.db.execute(sql`select pg_sleep(${sleepSeconds})`)
        return undefined
      } catch (error: unknown) {
        return findDatabaseFailure(error)
      }
    }),
  )
  await Bun.sleep(abortAfterMs)
  for (const controller of controllers) controller.abort()
  return Promise.all(pending)
}

async function waitUntilHealthy(limitMs: number): Promise<boolean> {
  const startedAt = performance.now()
  while (performance.now() - startedAt < limitMs) {
    const healthy = await provider.healthCheck().then(
      () => true,
      () => false,
    )
    if (healthy) return true
  }
  return false
}
