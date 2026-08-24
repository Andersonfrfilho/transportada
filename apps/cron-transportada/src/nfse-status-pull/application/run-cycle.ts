/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Um ciclo de reconciliação de NFS-e: uma instância segura o advisory lock, seleciona as notas
 * devidas e reconcilia uma a uma. Falha de uma nota é isolada — uma prefeitura fora do ar não
 * derruba o ciclo inteiro.
 */
import type { CronFiscalEnvironment } from '../../config/cron.constant.js'
import type { CronLogger } from '../../config/cron.types.js'
import type { AdvisoryLockPort } from '../../shared/advisory-lock.port.js'
import type { ReconcileInvoiceUseCase } from './reconcile-invoice.use-case.js'
import {
  createEmptyNfseIneligibleCounts,
  type NfseReconciliationIneligibleCounts,
  type SelectDueInvoicesUseCase,
} from './select-due-invoices.use-case.js'

export type NfseStatusPullCycleResult = {
  readonly acquiredLock: boolean
  readonly eligibleCount: number
  readonly enqueuedCount: number
  readonly ineligibleCounts: NfseReconciliationIneligibleCounts
  readonly skippedCount: number
  readonly failedCount: number
}

export type NfseStatusPullCycleDependencies = {
  readonly correlationId: string
  readonly environment: CronFiscalEnvironment
  readonly jobId: string
  readonly lock: AdvisoryLockPort
  readonly logger: CronLogger
  readonly now: Date
  readonly pageSize: number
  readonly reconcileUseCase: ReconcileInvoiceUseCase
  readonly selectDueUseCase: SelectDueInvoicesUseCase
}

const SETTLED_OUTCOMES = ['authorized', 'cancelled', 'rejected'] as const

export async function runNfseStatusPullCycle(
  dependencies: NfseStatusPullCycleDependencies,
): Promise<NfseStatusPullCycleResult> {
  const lockKey = `cron:${dependencies.jobId}`
  const acquired = await dependencies.lock.tryAcquire({ lockKey })
  if (!acquired) {
    dependencies.logger.info('cron_cycle_lock_not_acquired', { lockKey })
    return {
      acquiredLock: false,
      eligibleCount: 0,
      enqueuedCount: 0,
      failedCount: 0,
      ineligibleCounts: createEmptyNfseIneligibleCounts(),
      skippedCount: 0,
    }
  }

  try {
    return await reconcileDueInvoices(dependencies)
  } finally {
    await dependencies.lock.release({ lockKey })
  }
}

async function reconcileDueInvoices(
  dependencies: NfseStatusPullCycleDependencies,
): Promise<NfseStatusPullCycleResult> {
  const { due, ineligibleCounts } = await dependencies.selectDueUseCase.execute({
    environment: dependencies.environment,
    limit: dependencies.pageSize,
    now: dependencies.now,
  })

  let enqueuedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const invoice of due) {
    try {
      const { outcome } = await dependencies.reconcileUseCase.execute({
        invoice,
        now: dependencies.now,
      })
      if (SETTLED_OUTCOMES.some((settled) => settled === outcome)) enqueuedCount += 1
      else skippedCount += 1
    } catch (error) {
      failedCount += 1
      dependencies.logger.error('cron_cycle_invoice_reconcile_failed', {
        companyId: invoice.companyId,
        error: error instanceof Error ? error.message : 'unknown',
        invoiceId: invoice.invoiceId,
      })
    }
  }

  return {
    acquiredLock: true,
    eligibleCount: due.length,
    enqueuedCount,
    failedCount,
    ineligibleCounts,
    skippedCount,
  }
}
