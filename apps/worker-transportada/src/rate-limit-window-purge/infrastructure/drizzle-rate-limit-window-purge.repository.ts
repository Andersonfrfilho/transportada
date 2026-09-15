/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { PurgeExpiredRateLimitWindows } from '../application/rate-limit-window-purge.port.js'

export type RateLimitWindowPurgeDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * SQL parametrizado porque a chave é composta: o lote sai por `ctid` num `DELETE` só, com
 * `skip locked` para não esperar a linha que a API está somando agora. Pelo índice em
 * `window_start`, a varredura só lê o que já venceu.
 */
export function createDrizzlePurgeExpiredRateLimitWindows(
  database: RateLimitWindowPurgeDatabase,
): PurgeExpiredRateLimitWindows {
  return async ({ before, limit }) => {
    const deleted = await database.execute(sql`
      delete from rate_limit_windows
      where ctid in (
        select ctid from rate_limit_windows
        where window_start < ${before.toISOString()}::timestamptz
        order by window_start
        limit ${limit}::integer
        for update skip locked
      )
      returning 1
    `)
    return deleted.length
  }
}
