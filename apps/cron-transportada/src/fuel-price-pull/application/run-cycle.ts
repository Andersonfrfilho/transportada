/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Um ciclo de coleta do preço de referência: uma instância segura o advisory lock, baixa a semana
 * da ANP e a tarifa homologada da ANEEL, e grava o que falta. A semana indisponível não é meia
 * gravação — é `failedCount` 1, o código de saída 1 do processo, e a referência anterior intacta.
 *
 * As duas metades cabem no mesmo job de propósito: um deploy, uma janela e **um** advisory lock.
 * Cada uma falha por si — o litro coletado não é descartado porque o kWh não veio, e vice-versa,
 * senão um provedor fora do ar levaria junto a coleta que deu certo.
 */
import type { CronLogger } from '../../config/cron.types.js'
import type { AdvisoryLockPort } from '../../nfe-distribution-pull/application/advisory-lock.port.js'

import type { PullEnergyTariffUseCase } from './pull-energy-tariff.use-case.js'
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
  readonly energyUseCase: PullEnergyTariffUseCase
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
    const [weekly, tariff] = [
      await pullWeeklyReference(dependencies),
      await pullCurrentTariff(dependencies),
    ]

    return {
      acquiredLock: true,
      eligibleCount: weekly.eligibleCount + tariff.eligibleCount,
      enqueuedCount: weekly.enqueuedCount + tariff.enqueuedCount,
      failedCount: weekly.failedCount + tariff.failedCount,
      ineligibleCounts: {
        discardedRows:
          weekly.ineligibleCounts.discardedRows + tariff.ineligibleCounts.discardedRows,
      },
      skippedCount: weekly.skippedCount + tariff.skippedCount,
    }
  } finally {
    await dependencies.lock.release({ lockKey })
  }
}

async function pullCurrentTariff(
  dependencies: FuelPricePullCycleDependencies,
): Promise<FuelPricePullCycleResult> {
  try {
    const pull = await dependencies.energyUseCase.execute({ now: dependencies.now })

    return {
      acquiredLock: true,
      eligibleCount: pull.tariffCount,
      enqueuedCount: pull.writtenCount,
      failedCount: 0,
      ineligibleCounts: { discardedRows: pull.discardedRows },
      skippedCount: 0,
    }
  } catch (error) {
    dependencies.logger.error('cron_cycle_energy_tariff_pull_failed', {
      correlationId: dependencies.correlationId,
      error: error instanceof Error ? error.message : 'unknown',
    })

    return createEmptyResult({ acquiredLock: true, failedCount: 1 })
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
