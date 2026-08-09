/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerLogger } from '../shared/worker.types.js'

interface WorkerShutdownPort {
  stop(): Promise<void>
}

/**
 * O handler é registrado antes de o runtime existir, e por isso recebe uma promessa em vez do
 * desligamento pronto: sinal que chega no meio do boot espera o runtime ficar de pé e só então
 * drena. Registrar depois dos consumidores deixaria uma janela em que o processo já consome
 * mensagem e ainda morre pela disposição padrão do sinal, sem drenar nada.
 */
export function registerWorkerShutdownSignals(params: {
  readonly logger: WorkerLogger
  readonly resolveShutdown: () => Promise<WorkerShutdownPort>
}): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      safeLogInfo({
        logger: params.logger,
        message: 'worker_shutdown_started',
        metadata: { signal },
      })
      void params
        .resolveShutdown()
        .then((shutdown) => shutdown.stop())
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
