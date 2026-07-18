/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerLogger } from '../shared/worker.types.js'
import type { WorkerShutdown } from './worker-shutdown.service.js'

export function registerWorkerShutdownSignals(params: {
  readonly logger: WorkerLogger
  readonly shutdown: WorkerShutdown
}): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      safeLogInfo({
        logger: params.logger,
        message: 'worker_shutdown_started',
        metadata: { signal },
      })
      void params.shutdown
        .stop()
        .then(() => {
          safeLogInfo({
            logger: params.logger,
            message: 'worker_shutdown_completed',
            metadata: { signal },
          })
        })
        .catch(() => {
          process.exitCode = 1
          safeLogError({
            logger: params.logger,
            message: 'worker_shutdown_failed',
            metadata: { signal },
          })
        })
    })
  }
}
