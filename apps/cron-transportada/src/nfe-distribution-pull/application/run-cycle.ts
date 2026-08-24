/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Orchestrates one scheduled distribution pull cycle: a single instance holds a
 * Postgres advisory lock, selects eligible companies and enqueues an automation
 * import per company. A per-company failure is isolated so one bad tenant never
 * aborts the cycle.
 */
import type { CronFiscalEnvironment } from '../../config/cron.constant.js'
import type { CronLogger } from '../../config/cron.types.js'
import type { AdvisoryLockPort } from '../../shared/advisory-lock.port.js'
import type { EnqueueDistributionUseCase } from './enqueue-distribution.use-case.js'
import {
  createEmptyIneligibleCounts,
  type DistributionIneligibleCounts,
  type SelectEligibleCompaniesUseCase,
} from './select-eligible-companies.use-case.js'

export type DistributionPullCycleResult = {
  readonly acquiredLock: boolean
  readonly eligibleCount: number
  readonly enqueuedCount: number
  readonly ineligibleCounts: DistributionIneligibleCounts
  readonly skippedCount: number
  readonly failedCount: number
}

export type DistributionPullCycleDependencies = {
  readonly cadenceMinutes: number
  readonly correlationId: string
  readonly enqueueUseCase: EnqueueDistributionUseCase
  readonly environment: CronFiscalEnvironment
  readonly jobId: string
  readonly lock: AdvisoryLockPort
  readonly logger: CronLogger
  readonly now: Date
  readonly selectEligibleUseCase: SelectEligibleCompaniesUseCase
}

const SKIPPED_RESULT: DistributionPullCycleResult = {
  acquiredLock: false,
  eligibleCount: 0,
  enqueuedCount: 0,
  failedCount: 0,
  ineligibleCounts: createEmptyIneligibleCounts(),
  skippedCount: 0,
}

export async function runDistributionPullCycle(
  dependencies: DistributionPullCycleDependencies,
): Promise<DistributionPullCycleResult> {
  const lockKey = `cron:${dependencies.jobId}`
  const acquired = await dependencies.lock.tryAcquire({ lockKey })
  if (!acquired) {
    dependencies.logger.info('cron_cycle_lock_not_acquired', { lockKey })
    return SKIPPED_RESULT
  }

  try {
    return await enqueueEligibleCompanies(dependencies)
  } finally {
    await dependencies.lock.release({ lockKey })
  }
}

async function enqueueEligibleCompanies(
  dependencies: DistributionPullCycleDependencies,
): Promise<DistributionPullCycleResult> {
  const { eligible, ineligibleCounts } = await dependencies.selectEligibleUseCase.execute({
    environment: dependencies.environment,
    now: dependencies.now,
  })

  let enqueuedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const company of eligible) {
    try {
      const result = await dependencies.enqueueUseCase.execute({
        cadenceMinutes: dependencies.cadenceMinutes,
        company,
        correlationId: dependencies.correlationId,
        now: dependencies.now,
      })
      if (result.enqueued) enqueuedCount += 1
      else skippedCount += 1
    } catch (error) {
      failedCount += 1
      dependencies.logger.error('cron_cycle_company_enqueue_failed', {
        companyId: company.companyId,
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return {
    acquiredLock: true,
    eligibleCount: eligible.length,
    enqueuedCount,
    failedCount,
    ineligibleCounts,
    skippedCount,
  }
}
