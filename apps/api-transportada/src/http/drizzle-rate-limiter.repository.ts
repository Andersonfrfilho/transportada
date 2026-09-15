/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  ConsumeRateLimitWindowParams,
  RateLimitWindowStorePort,
} from './rate-limit-window.port.js'
import { isWithinRateLimit, resolveRetryAfterSeconds } from './rate-limit-window.policy.js'
import type { RateLimitOutcome } from './rate-limiter.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type ConsumedWindowRow = {
  readonly hits: number
  readonly now_seconds: number
  readonly window_start_seconds: number
}

/**
 * Um upsert só, em autocommit e fora da transação do caso de uso: o balde conta mesmo quando o
 * envio falha depois, e duas réplicas no mesmo instante somam na mesma linha. Janela e "agora" vêm
 * do relógio do **banco** — o relógio de cada réplica poderia discordar da janela da outra.
 */
export class DrizzleRateLimiterRepository implements RateLimitWindowStorePort {
  public constructor(private readonly database: Database) {}

  public async consume({
    maxRequests,
    scope,
    subjectKey,
    windowSeconds,
  }: ConsumeRateLimitWindowParams): Promise<RateLimitOutcome> {
    const rows = await this.database.execute<ConsumedWindowRow>(sql`
      insert into rate_limit_windows (scope, subject_key, window_start, hits)
      values (
        ${scope},
        ${subjectKey},
        to_timestamp(
          (floor(extract(epoch from now()) / ${windowSeconds}::integer) * ${windowSeconds}::integer)::double precision
        ),
        1
      )
      on conflict (scope, subject_key, window_start)
        do update set hits = rate_limit_windows.hits + 1
      returning
        hits,
        extract(epoch from window_start)::double precision as window_start_seconds,
        extract(epoch from now())::double precision as now_seconds
    `)
    const row = rows[0]
    if (row === undefined) throw new Error('rate limit upsert returned no row')

    if (isWithinRateLimit({ hits: Number(row.hits), maxRequests })) return { allowed: true }
    return {
      allowed: false,
      retryAfterSeconds: resolveRetryAfterSeconds({
        nowSeconds: Number(row.now_seconds),
        windowSeconds,
        windowStartSeconds: Number(row.window_start_seconds),
      }),
    }
  }
}
