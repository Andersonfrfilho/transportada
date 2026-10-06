/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M7): o banco da chegada para corrida — pool de verdade com folga e
 * uma conexão à parte que só olha `pg_stat_activity`. Uma transação bloqueadora segura as linhas que
 * as duas escritas disputam até as duas estarem paradas num lock: a corrida acontece sempre, sem
 * depender de relógio.
 */
import { SQL } from 'bun'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  seedCargoTenants,
  type CargoTenants,
  type TestDatabase,
} from './cargo-arrival-database.fixture.js'
import { withDisposableDatabase } from './disposable-database.fixture.js'
import { waitForLockWaiters } from './trip-dispatch-race.fixture.js'

export type CargoRace = {
  readonly database: TestDatabase
  readonly monitor: SQL
  readonly tenants: CargoTenants
}

const RACE_POOL = { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 } as const

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL

export async function withCargoRaceDatabase(
  operation: (race: CargoRace) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabase({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_cargo_race',
    open: (connectionString) => createDatabaseProvider({ pool: RACE_POOL, url: connectionString }),
    operation: async (database, connectionString) => {
      const monitor = new SQL(connectionString, { max: 1 })
      try {
        await operation({ database, monitor, tenants: await seedCargoTenants(database) })
      } finally {
        await monitor.close({ timeout: 0 })
      }
    },
  })
}

export type RaceUnderBlockerParams<TResult> = {
  /** Trava, numa transação à parte, o que as escritas vão disputar. */
  readonly block: (
    transaction: Parameters<Parameters<TestDatabase['db']['transaction']>[0]>[0],
  ) => Promise<unknown>
  readonly race: CargoRace
  readonly waiters: number
  readonly writes: readonly (() => Promise<TResult>)[]
}

/** Solta o bloqueio só depois de `waiters` transações paradas num lock; devolve cada desfecho. */
export async function raceUnderBlocker<TResult>(
  params: RaceUnderBlockerParams<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  let release = (): void => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let blocked = (): void => undefined
  const isBlocking = new Promise<void>((resolve) => {
    blocked = resolve
  })
  const blocker = params.race.database.db.transaction(async (transaction) => {
    await params.block(transaction)
    blocked()
    await released
  })
  await isBlocking
  const outcomes = Promise.allSettled(params.writes.map((write) => write()))
  try {
    await waitForLockWaiters(params.race.monitor, params.waiters)
  } finally {
    release()
    await blocker
  }
  return outcomes
}
