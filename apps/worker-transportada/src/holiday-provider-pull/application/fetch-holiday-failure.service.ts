/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O desfecho da falha de um par e a cota esgotada do mês: o que cada um grava na fila e se o ciclo para.
 */
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { FetchPair } from '../domain/holiday-fetch.types.js'
import {
  buildFailureRecord,
  buildNotCoveredRecord,
  buildQuotaExhaustedRecord,
  buildRateLimitedRecord,
} from '../domain/holiday-fetch-record.policy.js'
import {
  HOLIDAY_PROVIDER_ERROR_CODE,
  type HolidayProviderError,
} from '../domain/holiday-provider.error.js'

import type { Cycle } from './holiday-fetch-cycle.types.js'

export async function recordProviderFailure(input: {
  readonly cycle: Cycle
  readonly error: HolidayProviderError
  readonly pair: FetchPair
}): Promise<void> {
  const { cycle, error, pair } = input
  const { now, tally } = cycle
  const { store } = cycle.dependencies

  switch (error.code) {
    case HOLIDAY_PROVIDER_ERROR_CODE.UNAUTHORIZED:
      tally.unauthorized = true
      cycle.halt = 'unauthorized'
      return
    case HOLIDAY_PROVIDER_ERROR_CODE.RATE_LIMITED:
      tally.rateLimited = true
      cycle.halt = 'rate_limited'
      await store.recordFetches([
        buildRateLimitedRecord({ now, pair, retryAfterSeconds: error.retryAfterSeconds }),
      ])
      return
    case HOLIDAY_PROVIDER_ERROR_CODE.NOT_FOUND:
      tally.pairsNotCovered += 1
      await store.recordFetches([buildNotCoveredRecord({ now, pair })])
      return
    default:
      if (error.code === HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE) {
        tally.malformedResponses += 1
      } else {
        tally.unreachable += 1
      }
      await store.recordFetches([buildFailureRecord({ errorCode: error.code, now, pair })])
  }
}

/** Orçamento do mês atingido: o par em curso e os que sobraram esperam o dia 1º (não é falha). */
export async function markQuotaExhausted(input: {
  readonly cycle: Cycle
  readonly remaining: readonly FetchPair[]
}): Promise<void> {
  const { cycle, remaining } = input
  const pairs = cycle.haltedPair === undefined ? remaining : [cycle.haltedPair, ...remaining]

  try {
    await cycle.dependencies.store.recordFetches(
      pairs.map((pair) => buildQuotaExhaustedRecord({ now: cycle.now, pair })),
    )
  } catch (error: unknown) {
    cycle.tally.unexpectedFailures += 1
    safeLogError({
      logger: cycle.dependencies.logger,
      message: 'holiday_fetch_quota_record_failed',
      metadata: {
        correlationId: cycle.correlationId,
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
  }
}
