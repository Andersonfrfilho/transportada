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
  resolveCargoLayoutPreviewCutoff,
  TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE,
  TRIP_CARGO_LAYOUT_PURGE_MAX_BATCHES,
} from '../domain/trip-cargo-layout-purge.constant.js'
import type { PurgeStaleCargoLayoutPreviews } from './trip-cargo-layout-purge.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

export type TripCargoLayoutPurgeRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly purge: PurgeStaleCargoLayoutPreviews
}

/**
 * Spec 145 D19: a prévia da planta que não virou viagem some em 24 h. Mesmo desenho de
 * `trip.location.purge` — lotes, teto e parada no limite do lote —, e o mesmo vocabulário de falha
 * vazio: a rotina só toca o próprio banco.
 */
export function createTripCargoLayoutPurgeRoutine(
  dependencies: TripCargoLayoutPurgeRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: TripCargoLayoutPurgeRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const before = resolveCargoLayoutPreviewCutoff(dependencies.now())
  let deleted = 0
  let deletedOutbox = 0
  let batches = 0

  while (batches < TRIP_CARGO_LAYOUT_PURGE_MAX_BATCHES && !context.isStopRequested()) {
    const batch = await dependencies.purge({ before, limit: TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE })
    if (batch.deleted === 0) break
    deleted += batch.deleted
    deletedOutbox += batch.deletedOutbox
    batches += 1
  }

  // Só contagens: o `input` apagado tem nome de cliente e endereço, e não pode renascer no log
  safeLogInfo({
    logger: dependencies.logger,
    message: 'trip_cargo_layout_purge_cycle_finished',
    metadata: {
      batches,
      correlationId: context.correlationId,
      deleted,
      deletedOutbox,
      executionId: context.executionId,
      exhausted: batches >= TRIP_CARGO_LAYOUT_PURGE_MAX_BATCHES,
    },
  })

  return { counters: { batches, deleted, deletedOutbox }, outcome: COMPLETED_OUTCOME }
}
