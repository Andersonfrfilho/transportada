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
  RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE,
  RATE_LIMIT_WINDOW_PURGE_MAX_BATCHES,
  resolveRateLimitWindowPurgeCutoff,
} from '../domain/rate-limit-window-purge.constant.js'
import type { PurgeExpiredRateLimitWindows } from './rate-limit-window-purge.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

export type RateLimitWindowPurgeRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly purge: PurgeExpiredRateLimitWindows
}

/**
 * Spec 150 T406: a janela vencida do limitador de taxa não conta mais nada. Mesmo desenho de
 * `trip.cargo-layout.purge` — lotes, teto e parada no limite do lote —, e o mesmo vocabulário de
 * falha vazio: a rotina só toca o próprio banco.
 */
export function createRateLimitWindowPurgeRoutine(
  dependencies: RateLimitWindowPurgeRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: RateLimitWindowPurgeRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const before = resolveRateLimitWindowPurgeCutoff(dependencies.now())
  let deleted = 0
  let batches = 0

  while (batches < RATE_LIMIT_WINDOW_PURGE_MAX_BATCHES && !context.isStopRequested()) {
    const removed = await dependencies.purge({ before, limit: RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE })
    if (removed === 0) break
    deleted += removed
    batches += 1
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'rate_limit_window_purge_cycle_finished',
    metadata: {
      batches,
      correlationId: context.correlationId,
      deleted,
      executionId: context.executionId,
      exhausted: batches >= RATE_LIMIT_WINDOW_PURGE_MAX_BATCHES,
    },
  })

  return { counters: { batches, deleted }, outcome: COMPLETED_OUTCOME }
}
