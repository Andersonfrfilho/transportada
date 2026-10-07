/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  CARGO_PREVIEW_RETENTION_BATCH_SIZE,
  CARGO_PREVIEW_RETENTION_MAX_BATCHES,
  CARGO_PREVIEW_RETENTION_MAX_CONSECUTIVE_STORAGE_FAILURES,
} from '../domain/cargo-preview-retention.constant.js'
import type { ApplyCargoPreviewRetentionBatch } from './cargo-preview-retention.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

export type CargoPreviewRetentionRoutineDependencies = {
  readonly apply: ApplyCargoPreviewRetentionBatch
  readonly logger: WorkerLogger
  readonly now: () => Date
}

/**
 * Decisão do usuário (2026-10-06): 90 dias depois de a prévia ficar sem item em aberto, o arquivo da
 * planilha sai do bucket e o dado pessoal dos itens é anulado. Falha de bucket entra como contador
 * (`failed`), não como exceção — o vocabulário de falha da rotina é vazio.
 */
export function createCargoPreviewRetentionRoutine(
  dependencies: CargoPreviewRetentionRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: CargoPreviewRetentionRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const now = dependencies.now()
  const excludedPreviewIds: string[] = []
  const totals = { batches: 0, failed: 0, partial: 0, retained: 0, skipped: 0 }
  let consecutiveStorageFailures = 0
  let stoppedByStorageFailures = false

  while (totals.batches < CARGO_PREVIEW_RETENTION_MAX_BATCHES && !context.isStopRequested()) {
    const batch = await dependencies.apply({
      excludedPreviewIds: [...excludedPreviewIds],
      limit: CARGO_PREVIEW_RETENTION_BATCH_SIZE,
      now,
    })
    // Nunca `retained === 0`: prévia pulada por lock ou falha de bucket deixa `retained` em zero
    // com candidatas restando, e o laço pararia cedo.
    if (batch.processed === 0) break
    totals.batches += 1
    totals.failed += batch.failed
    totals.partial += batch.partial
    totals.retained += batch.retained
    totals.skipped += batch.skipped
    excludedPreviewIds.push(...batch.deferredPreviewIds)

    consecutiveStorageFailures = batch.retained > 0 ? 0 : consecutiveStorageFailures + batch.failed
    if (consecutiveStorageFailures >= CARGO_PREVIEW_RETENTION_MAX_CONSECUTIVE_STORAGE_FAILURES) {
      stoppedByStorageFailures = true
      break
    }
  }

  // Só contagens: o id da prévia aponta para contratante e carga, e não renasce no log.
  safeLogInfo({
    logger: dependencies.logger,
    message: 'cargo_preview_retention_cycle_finished',
    metadata: {
      ...totals,
      correlationId: context.correlationId,
      exhausted: totals.batches >= CARGO_PREVIEW_RETENTION_MAX_BATCHES,
      executionId: context.executionId,
      stoppedByStorageFailures,
    },
  })

  return { counters: totals, outcome: COMPLETED_OUTCOME }
}
