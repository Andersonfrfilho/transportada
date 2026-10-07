/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { JobRoutine, JobRoutineResult } from '../../job-run/application/job-routine.port.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { ApplyCargoPreviewRetentionBatch } from './cargo-preview-retention.port.js'

export type CargoPreviewRetentionRoutineDependencies = {
  readonly apply: ApplyCargoPreviewRetentionBatch
  readonly logger: WorkerLogger
  readonly now: () => Date
}

export function createCargoPreviewRetentionRoutine(
  dependencies: CargoPreviewRetentionRoutineDependencies,
): JobRoutine {
  void dependencies
  const result: JobRoutineResult = { counters: {}, outcome: 'succeeded' }
  return { run: async () => result }
}
