/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O upsert da fila da busca: `holiday_provider_fetches` pela chave `(escopo, código, ano)`.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { holidayProviderFetches } from '../../database/holiday-provider.schema.js'
import type { FetchRecord } from '../domain/holiday-fetch.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type Executor = Pick<Database, 'insert'>

export async function upsertFetchRecords(
  executor: Executor,
  records: readonly FetchRecord[],
): Promise<void> {
  if (records.length === 0) return

  await executor
    .insert(holidayProviderFetches)
    .values(
      records.map((record) => ({
        attempts: record.attempts,
        fetchedAt: record.fetchedAt,
        ibgeCode: record.pair.ibgeCode,
        lastErrorCode: record.errorCode,
        nextAttemptAt: record.nextAttemptAt,
        scope: record.pair.scope,
        status: record.status,
        year: record.pair.year,
      })),
    )
    .onConflictDoUpdate({
      set: {
        attempts: sql`excluded.attempts`,
        // A tentativa que falhou não apaga a data da última busca boa.
        fetchedAt: sql`coalesce(excluded.fetched_at, ${holidayProviderFetches.fetchedAt})`,
        lastErrorCode: sql`excluded.last_error_code`,
        nextAttemptAt: sql`excluded.next_attempt_at`,
        status: sql`excluded.status`,
      },
      target: [
        holidayProviderFetches.scope,
        holidayProviderFetches.ibgeCode,
        holidayProviderFetches.year,
      ],
    })
}
