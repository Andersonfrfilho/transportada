/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Session-level Postgres advisory lock (no Redis/Redlock — forbidden here). The
 * cron connection is pinned to a single socket (max: 1) so the lock survives
 * across the per-company enqueue transactions and is released in the cycle's
 * finally. The key is hashed with hashtextextended to fit the bigint lock space.
 */
import { sql } from 'drizzle-orm'

import type { CronDatabase } from '../database/cron-database.types.js'
import type { AdvisoryLockPort } from './advisory-lock.port.js'

export function createDrizzleAdvisoryLock(dependencies: {
  readonly db: CronDatabase
}): AdvisoryLockPort {
  return {
    async tryAcquire({ lockKey }) {
      const rows = await dependencies.db.execute<{ readonly acquired: boolean }>(
        sql`select pg_try_advisory_lock(hashtextextended(${lockKey}, 0)) as acquired`,
      )
      return rows[0]?.acquired === true
    },
    async release({ lockKey }) {
      await dependencies.db.execute(sql`select pg_advisory_unlock(hashtextextended(${lockKey}, 0))`)
    },
  }
}
