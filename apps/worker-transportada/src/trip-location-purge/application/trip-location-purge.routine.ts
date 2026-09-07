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
  resolveTrackingPurgeCutoff,
  TRIP_LOCATION_PURGE_BATCH_SIZE,
  TRIP_LOCATION_PURGE_MAX_BATCHES,
  TRIP_LOCATION_RETENTION_DAYS,
  TRIP_TRACKING_MAX_AGE_HOURS,
} from '../domain/trip-location-purge.constant.js'
import type { PurgeStalePings, RedactTripLocations } from './trip-location.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

export type TripLocationPurgeRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  /** ADR-0056 §2: o rastro ao vivo, com prazo próprio e muito mais curto que o da coordenada. */
  readonly purgeStalePings: PurgeStalePings
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
  const now = dependencies.now()
  const before = resolveRetentionCutoff(now)
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
   * ADR-0056 §2: o rastro ao vivo, no mesmo ciclo e com corte próprio. Ele **não** depende de a
   * viagem fechar — `purgeByTrip` já cobre o fechamento, e o que sobra é justamente a viagem que
   * ninguém fechou, que com o segundo plano do aplicativo acompanha o motorista em casa.
   */
  const pingCutoff = resolveTrackingPurgeCutoff(now)
  let purgedPings = 0
  let pingBatches = 0

  while (pingBatches < TRIP_LOCATION_PURGE_MAX_BATCHES && !context.isStopRequested()) {
    const purged = await dependencies.purgeStalePings({
      before: pingCutoff,
      limit: TRIP_LOCATION_PURGE_BATCH_SIZE,
    })
    if (purged === 0) break
    purgedPings += purged
    pingBatches += 1
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
      pingBatches,
      purgedPings,
      redacted: redactedCount,
      retentionDays: TRIP_LOCATION_RETENTION_DAYS,
      trackingMaxAgeHours: TRIP_TRACKING_MAX_AGE_HOURS,
    },
  })

  return {
    counters: { batches: batchCount, purgedPings, redacted: redactedCount },
    outcome: COMPLETED_OUTCOME,
  }
}
