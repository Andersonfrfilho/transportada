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
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_BATCH_SIZE,
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_GRACE_SECONDS,
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_BATCHES,
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES,
} from '../domain/trip-occurrence-upload-expire.constant.js'
import type { ExpireOccurrenceUploadBatch } from './trip-occurrence-upload-expire.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

export type TripOccurrenceUploadExpireRoutineDependencies = {
  readonly expire: ExpireOccurrenceUploadBatch
  readonly logger: WorkerLogger
  readonly now: () => Date
}

/**
 * Achado [3] da revisão de código de 23/09 (spec 179): sem esta rotina, `trip_occurrence_uploads`
 * ficava `pending` para sempre quando o motorista perdia sinal antes do `confirm`, e o objeto que ele
 * chegou a subir nunca tinha dono no bucket — o `trip.occurrence-attachment.purge` (spec 161) só
 * varre `stored_objects`, que só nasce na confirmação.
 *
 * Ela não fala com ninguém de fora além do bucket, igual à varredura irmã — o vocabulário de falha é
 * vazio porque o que pode dar errado é o imprevisto, e o invólucro já tem nome para ele.
 */
export function createTripOccurrenceUploadExpireRoutine(
  dependencies: TripOccurrenceUploadExpireRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: TripOccurrenceUploadExpireRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const before = new Date(
    dependencies.now().getTime() - TRIP_OCCURRENCE_UPLOAD_EXPIRE_GRACE_SECONDS * 1000,
  )
  let expired = 0
  let missing = 0
  let failed = 0
  let batches = 0
  let consecutiveStorageFailures = 0
  let stoppedByStorageFailures = false

  while (batches < TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_BATCHES && !context.isStopRequested()) {
    const batch = await dependencies.expire({
      before,
      limit: TRIP_OCCURRENCE_UPLOAD_EXPIRE_BATCH_SIZE,
    })
    // Nunca `expired === 0`: objeto órfão sem lock, corrida com um `confirm`, ou falha de storage
    // deixam `expired` em zero com candidatas restando, e o laço pararia cedo ou repetiria o lote.
    if (batch.processed === 0) break
    expired += batch.expired
    missing += batch.missing
    failed += batch.failed
    batches += 1

    consecutiveStorageFailures = batch.expired > 0 ? 0 : consecutiveStorageFailures + batch.failed
    if (
      consecutiveStorageFailures >= TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES
    ) {
      stoppedByStorageFailures = true
      break
    }
  }

  // Só contagens: a chave do objeto carrega tenant e viagem, e não pode renascer no log.
  safeLogInfo({
    logger: dependencies.logger,
    message: 'trip_occurrence_upload_expire_cycle_finished',
    metadata: {
      batches,
      correlationId: context.correlationId,
      executionId: context.executionId,
      exhausted: batches >= TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_BATCHES,
      expired,
      failed,
      missing,
      stoppedByStorageFailures,
    },
  })

  return { counters: { batches, expired, failed, missing }, outcome: COMPLETED_OUTCOME }
}
