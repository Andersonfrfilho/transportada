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
  TRIP_OCCURRENCE_ATTACHMENT_PURGE_BATCH_SIZE,
  TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_BATCHES,
  TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_CONSECUTIVE_STORAGE_FAILURES,
} from '../domain/trip-occurrence-attachment-purge.constant.js'
import type { PurgeOccurrenceAttachmentBatch } from './trip-occurrence-attachment-purge.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

export type TripOccurrenceAttachmentPurgeRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly purge: PurgeOccurrenceAttachmentBatch
}

/**
 * RF21–RF25: a foto de ocorrência tem cinco anos de vida, e esta rotina é quem cumpre o prazo —
 * apagando bytes e linha juntos, nunca deixando miniatura viva sem original nem o inverso.
 *
 * Ela não fala com ninguém de fora além do bucket, por trás da porta mínima que recebe; o
 * vocabulário de falha é vazio porque o que pode dar errado é o imprevisto, e o invólucro já tem
 * nome para ele — a falha de storage entra como contador (`failed`), não como exceção.
 */
export function createTripOccurrenceAttachmentPurgeRoutine(
  dependencies: TripOccurrenceAttachmentPurgeRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: TripOccurrenceAttachmentPurgeRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const before = dependencies.now()
  let deleted = 0
  let missing = 0
  let failed = 0
  let batches = 0
  let consecutiveStorageFailures = 0
  let stoppedByStorageFailures = false

  while (batches < TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_BATCHES && !context.isStopRequested()) {
    const batch = await dependencies.purge({
      before,
      limit: TRIP_OCCURRENCE_ATTACHMENT_PURGE_BATCH_SIZE,
    })
    // Ajuste 5: nunca `deleted === 0` — objeto órfão, lock perdido ou falha de storage deixam
    // `deleted` em zero com candidatas restando, e o laço pararia cedo ou repetiria o lote sempre.
    if (batch.processed === 0) break
    deleted += batch.deleted
    missing += batch.missing
    failed += batch.failed
    batches += 1

    consecutiveStorageFailures = batch.deleted > 0 ? 0 : consecutiveStorageFailures + batch.failed
    if (
      consecutiveStorageFailures >=
      TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_CONSECUTIVE_STORAGE_FAILURES
    ) {
      stoppedByStorageFailures = true
      break
    }
  }

  // Só contagens: a chave do objeto carrega tenant e ocorrência, e não pode renascer no log.
  safeLogInfo({
    logger: dependencies.logger,
    message: 'trip_occurrence_attachment_purge_cycle_finished',
    metadata: {
      batches,
      correlationId: context.correlationId,
      deleted,
      executionId: context.executionId,
      exhausted: batches >= TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_BATCHES,
      failed,
      missing,
      stoppedByStorageFailures,
    },
  })

  return { counters: { batches, deleted, failed, missing }, outcome: COMPLETED_OUTCOME }
}
