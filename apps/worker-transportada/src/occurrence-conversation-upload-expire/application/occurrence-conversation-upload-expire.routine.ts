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
  OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_BATCH_SIZE,
  OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_GRACE_SECONDS,
  OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_BATCHES,
  OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES,
} from '../domain/occurrence-conversation-upload-expire.constant.js'
import type { ExpireOccurrenceUploadBatch } from '../../trip-occurrence-upload-expire/application/trip-occurrence-upload-expire.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

export type OccurrenceConversationUploadExpireRoutineDependencies = {
  readonly expire: ExpireOccurrenceUploadBatch
  readonly logger: WorkerLogger
  readonly now: () => Date
}

/**
 * Spec 183 T702c2: o pedido de upload do anexo da conversa que nunca virou anexo de mensagem (a
 * pessoa desistiu, perdeu sinal, ou a mensagem recusou o arquivo) ficava `pending` para sempre, e o
 * objeto que chegou ao bucket não tinha dono — `stored_objects` só nasce quando o anexo liga à
 * mensagem. A unidade é a da rotina irmã da spec 179 (`expireOccurrenceUploadUnit`): apaga o objeto
 * antes de marcar `expired`, numa transação por pedido.
 */
export function createOccurrenceConversationUploadExpireRoutine(
  dependencies: OccurrenceConversationUploadExpireRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: OccurrenceConversationUploadExpireRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const before = new Date(
    dependencies.now().getTime() - OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_GRACE_SECONDS * 1000,
  )
  let expired = 0
  let missing = 0
  let failed = 0
  let batches = 0
  let consecutiveStorageFailures = 0
  let stoppedByStorageFailures = false

  while (
    batches < OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_BATCHES &&
    !context.isStopRequested()
  ) {
    const batch = await dependencies.expire({
      before,
      limit: OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_BATCH_SIZE,
    })
    // Nunca `expired === 0`: objeto órfão sem lock, corrida com o envio da mensagem, ou falha de storage
    // deixam `expired` em zero com candidatas restando, e o laço pararia cedo ou repetiria o lote.
    if (batch.processed === 0) break
    expired += batch.expired
    missing += batch.missing
    failed += batch.failed
    batches += 1

    consecutiveStorageFailures = batch.expired > 0 ? 0 : consecutiveStorageFailures + batch.failed
    if (
      consecutiveStorageFailures >=
      OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES
    ) {
      stoppedByStorageFailures = true
      break
    }
  }

  // Só contagens: nenhuma chave, nome ou empresa no log.
  safeLogInfo({
    logger: dependencies.logger,
    message: 'occurrence_conversation_upload_expire_cycle_finished',
    metadata: {
      batches,
      correlationId: context.correlationId,
      executionId: context.executionId,
      exhausted: batches >= OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_BATCHES,
      expired,
      failed,
      missing,
      stoppedByStorageFailures,
    },
  })

  return { counters: { batches, expired, failed, missing }, outcome: COMPLETED_OUTCOME }
}
