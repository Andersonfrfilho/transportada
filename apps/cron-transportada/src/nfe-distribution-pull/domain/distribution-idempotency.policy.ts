/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Derives the stable idempotency key for an automation enqueue. The key is
 * bucketed by the cron cadence so two cycles inside the same window resolve to
 * the same key and the (company_id, idempotency_key) unique on nfe_imports
 * blocks the duplicate. The bucket rolls over on the next cadence window.
 */
import type { CronFiscalEnvironment } from '../../config/cron.constant.js'
import { DISTRIBUTION_PULL_JOB } from './distribution-pull.constant.js'

const MILLISECONDS_PER_MINUTE = 60_000

export function deriveDistributionIdempotencyKey(input: {
  readonly cadenceMinutes: number
  readonly companyId: string
  readonly cycleInstant: Date
  readonly environment: CronFiscalEnvironment
}): string {
  const bucketMs = input.cadenceMinutes * MILLISECONDS_PER_MINUTE
  const bucketStart = Math.floor(input.cycleInstant.getTime() / bucketMs) * bucketMs
  return `${DISTRIBUTION_PULL_JOB}:${input.environment}:${input.companyId}:${bucketStart}`
}
