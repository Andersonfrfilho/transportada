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
  resolveRetentionCutoff,
  TRIP_LOCATION_PURGE_BATCH_SIZE,
  TRIP_LOCATION_PURGE_MAX_BATCHES,
  TRIP_LOCATION_RETENTION_DAYS,
} from '../domain/trip-location-purge.constant.js'
import type { RedactTripLocations } from './trip-location.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

export type TripLocationPurgeRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly redact: RedactTripLocations
}

/**
 * ADR-0045 §3.3: o prazo da coordenada só existe porque alguém o cumpre. Esta rotina é esse alguém.
 *
 * Ela não fala com ninguém de fora e não tem vocabulário de falha próprio: o que pode dar errado é o
 * imprevisto, e o invólucro já tem nome para ele.
 */
export function createTripLocationPurgeRoutine(
  dependencies: TripLocationPurgeRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: TripLocationPurgeRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const before = resolveRetentionCutoff(dependencies.now())
  let redactedCount = 0
  let batchCount = 0

  // Parada é lida no limite do lote: o que já foi apagado está apagado, e o resto espera a batida.
  while (batchCount < TRIP_LOCATION_PURGE_MAX_BATCHES && !context.isStopRequested()) {
    const redacted = await dependencies.redact({ before, limit: TRIP_LOCATION_PURGE_BATCH_SIZE })
    if (redacted === 0) break
    redactedCount += redacted
    batchCount += 1
  }

  /**
   * O log conta quantas coordenadas caíram e se sobrou fila — nunca qual evento, de quem, nem onde.
   * Um expurgo de PII que escreve a PII no log não expurgou nada.
   */
  safeLogInfo({
    logger: dependencies.logger,
    message: 'trip_location_purge_cycle_finished',
    metadata: {
      batches: batchCount,
      correlationId: context.correlationId,
      executionId: context.executionId,
      exhausted: batchCount >= TRIP_LOCATION_PURGE_MAX_BATCHES,
      redacted: redactedCount,
      retentionDays: TRIP_LOCATION_RETENTION_DAYS,
    },
  })

  return { counters: { batches: batchCount, redacted: redactedCount }, outcome: COMPLETED_OUTCOME }
}
