/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Um ciclo de coleta do preço de referência: uma instância segura o advisory lock, baixa a semana
 * da ANP e grava o que falta. A semana indisponível não é meia gravação — é `failedCount` 1, o
 * código de saída 1 do processo, e a referência anterior intacta.
 */
import type { CronLogger } from '../../config/cron.types.js'
import type { AdvisoryLockPort } from '../../nfe-distribution-pull/application/advisory-lock.port.js'

import type { PullFuelReferenceUseCase } from './pull-fuel-reference.use-case.js'

export type FuelPriceIneligibleCounts = {
  readonly discardedRows: number
}

export type FuelPricePullCycleResult = {
  readonly acquiredLock: boolean
  readonly eligibleCount: number
  readonly enqueuedCount: number
  readonly failedCount: number
  readonly ineligibleCounts: FuelPriceIneligibleCounts
  readonly skippedCount: number
}

export type FuelPricePullCycleDependencies = {
  readonly correlationId: string
  readonly jobId: string
  readonly lock: AdvisoryLockPort
  readonly logger: CronLogger
  readonly now: Date
  readonly pullUseCase: PullFuelReferenceUseCase
}

function createEmptyResult(input: {
  readonly acquiredLock: boolean
  readonly failedCount: number
}): FuelPricePullCycleResult {
  return {
    acquiredLock: input.acquiredLock,
    eligibleCount: 0,
    enqueuedCount: 0,
    failedCount: input.failedCount,
    ineligibleCounts: { discardedRows: 0 },
    skippedCount: 0,
  }
}

export async function runFuelPricePullCycle(
  dependencies: FuelPricePullCycleDependencies,
): Promise<FuelPricePullCycleResult> {
  const lockKey = `cron:${dependencies.jobId}`
  const acquired = await dependencies.lock.tryAcquire({ lockKey })

  if (!acquired) {
    dependencies.logger.info('cron_cycle_lock_not_acquired', { lockKey })

    return createEmptyResult({ acquiredLock: false, failedCount: 0 })
  }

  try {
    return await pullWeeklyReference(dependencies)
  } finally {
    await dependencies.lock.release({ lockKey })
  }
}

async function pullWeeklyReference(
  dependencies: FuelPricePullCycleDependencies,
): Promise<FuelPricePullCycleResult> {
  try {
    const pull = await dependencies.pullUseCase.execute({ now: dependencies.now })

    return {
      acquiredLock: true,
      eligibleCount: pull.referenceCount,
      enqueuedCount: pull.insertedCount,
      failedCount: 0,
      ineligibleCounts: { discardedRows: pull.discardedRows },
      skippedCount: pull.skippedCount,
    }
  } catch (error) {
    dependencies.logger.error('cron_cycle_fuel_reference_pull_failed', {
      correlationId: dependencies.correlationId,
      error: error instanceof Error ? error.message : 'unknown',
    })

    return createEmptyResult({ acquiredLock: true, failedCount: 1 })
  }
}
