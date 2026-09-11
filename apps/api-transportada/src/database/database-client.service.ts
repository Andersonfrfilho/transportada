/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'

import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sql'

import { readRequestScope } from '../shared/request-scope.service'
import type { DatabasePoolConfiguration } from '../shared/api.types'
import {
  BUN_SQL_ACQUIRE_TIMEOUT_CODE,
  BUN_SQL_CONNECTION_CODE_PREFIX,
  DATABASE_UNAVAILABLE_REASON,
  POSTGRES_QUERY_CANCELED_SQLSTATE,
  type DatabaseUnavailableReason,
} from './database-pool.constant'
import { DatabaseQueryAbortedError, DatabaseUnavailableError } from './database-unavailable.error'

const HEALTH_CHECK_QUERY = sql`select 1`

type CreateDatabaseProviderParams = {
  readonly pool: DatabasePoolConfiguration
  readonly url: string
}

/**
 * Spec 137: o banco da API, com o pool e os tempos explícitos que `createDrizzleProvider` não
 * expõe. Mesma forma do provider (`db`, `healthCheck`, `close`) para ninguém a jusante perceber.
 *
 * ⚠️ `prepare: false` é a correção da causa: com as instruções preparadas do Bun SQL 1.3.14, 35
 * prévias de carga concorrentes deixavam consultas **sem resolver para sempre** (3 de 3 rodadas),
 * com o Postgres vendo as conexões ociosas; sem elas, 15 de 15 terminaram, até 150 concorrentes.
 */
export function createDatabaseProvider({
  pool,
  url,
}: CreateDatabaseProviderParams): DrizzleProvider {
  const client = new SQL({
    connection: { statement_timeout: String(pool.queryTimeoutMs) },
    connectionTimeout: pool.connectTimeoutSeconds,
    max: pool.max,
    prepare: false,
    url,
  })
  const db = drizzle({ client: guardClient(client, pool.queryTimeoutMs) })
  let closePromise: Promise<void> | undefined

  return {
    db,
    async healthCheck() {
      await db.execute(HEALTH_CHECK_QUERY)
      return { healthy: true }
    },
    close() {
      closePromise ??= client.close()
      return closePromise
    },
  }
}

type SqlClient = SQL
type SqlQuery = Promise<unknown> & {
  cancel(): unknown
  values(): SqlQuery
}

/**
 * O drizzle chama o cliente de quatro jeitos — `client(strings, ...params)`, `client.unsafe()`,
 * `.values()` na consulta e `client.begin()`/`savepoint()` com um cliente de transação —, e o
 * prazo tem de valer nos quatro, inclusive dentro da transação.
 */
function guardClient(client: SqlClient, deadlineMs: number): SqlClient {
  return new Proxy(client, {
    apply(target, thisArgument, argumentList) {
      return guardQuery(Reflect.apply(target, thisArgument, argumentList) as SqlQuery, deadlineMs)
    },
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      if (property === 'unsafe') {
        return (...argumentList: unknown[]) =>
          guardQuery(Reflect.apply(value, target, argumentList) as SqlQuery, deadlineMs)
      }
      if (property === 'begin' || property === 'savepoint') {
        return (...argumentList: unknown[]) =>
          Reflect.apply(
            value,
            target,
            argumentList.map((argument) =>
              typeof argument === 'function'
                ? (transaction: SqlClient) => argument(guardClient(transaction, deadlineMs))
                : argument,
            ),
          )
      }
      return value.bind(target)
    },
  })
}

function guardQuery(query: SqlQuery, deadlineMs: number): SqlQuery {
  let settled: Promise<unknown> | undefined
  const run = (): Promise<unknown> => {
    settled ??= settleWithinDeadline(query, deadlineMs)
    return settled
  }
  return new Proxy(query, {
    get(target, property) {
      if (property === 'then') {
        return (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => run().then(onFulfilled, onRejected)
      }
      if (property === 'catch') {
        return (onRejected?: (reason: unknown) => unknown) => run().catch(onRejected)
      }
      if (property === 'finally') return (onFinally?: () => void) => run().finally(onFinally)
      if (property === 'values') return () => guardQuery(target.values(), deadlineMs)
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/**
 * Consulta que não volta no prazo vira `DatabaseUnavailableError`, e a do pedido abortado vira
 * `DatabaseQueryAbortedError` — nos dois casos quem espera é solto na hora, e a consulta é
 * cancelada.
 *
 * ⚠️ O `cancel()` do Bun só tira da fila o que **ainda não foi enviado**. Medido (spec 137), pool de
 * uma conexão e vinte pedidos abortados: com nada rodando, a próxima consulta respondeu em 18 ms;
 * com uma já rodando, as da fila já tinham ido para o servidor e rodaram mesmo assim — a conexão
 * voltou quando elas terminaram (~4 s para 20 × 0,2 s), nunca presa. Consulta em execução também
 * não é interrompida pelo `cancel()` (medido: terminou 4,8 s depois dele). Quem limita o que
 * sobra é o `statement_timeout`, com o mesmo prazo: nada abandonado ocupa conexão além dele.
 */
function settleWithinDeadline(query: SqlQuery, deadlineMs: number): Promise<unknown> {
  const signal = readRequestScope()?.signal
  return new Promise((resolve, reject) => {
    // O pedido já foi embora: a consulta é preguiçosa e nem chega a nascer.
    if (signal?.aborted === true) {
      reject(new DatabaseQueryAbortedError())
      return
    }
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', handleAbort)
    }
    const handleAbort = () => {
      cleanup()
      query.cancel()
      reject(new DatabaseQueryAbortedError())
    }
    const timer = setTimeout(() => {
      cleanup()
      query.cancel()
      reject(new DatabaseUnavailableError(DATABASE_UNAVAILABLE_REASON.queryTimeout))
    }, deadlineMs)
    signal?.addEventListener('abort', handleAbort, { once: true })
    Promise.resolve(query).then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        cleanup()
        reject(translateDriverFailure(error))
      },
    )
  })
}

function translateDriverFailure(error: unknown): unknown {
  const reason = classifyDriverFailure(error)
  return reason === undefined ? error : new DatabaseUnavailableError(reason, { cause: error })
}

function classifyDriverFailure(error: unknown): DatabaseUnavailableReason | undefined {
  const code = readStringProperty(error, 'code')
  if (code === BUN_SQL_ACQUIRE_TIMEOUT_CODE) return DATABASE_UNAVAILABLE_REASON.poolExhausted
  if (readStringProperty(error, 'errno') === POSTGRES_QUERY_CANCELED_SQLSTATE) {
    return DATABASE_UNAVAILABLE_REASON.queryTimeout
  }
  if (code?.startsWith(BUN_SQL_CONNECTION_CODE_PREFIX) === true || code === 'ECONNREFUSED') {
    return DATABASE_UNAVAILABLE_REASON.connectionFailed
  }
  return undefined
}

function readStringProperty(error: unknown, property: string): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const value = (error as Record<string, unknown>)[property]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}
