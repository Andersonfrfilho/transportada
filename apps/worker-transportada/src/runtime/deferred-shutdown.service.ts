/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { WorkerShutdown } from './worker-shutdown.service.js'

export interface DeferredShutdown {
  readonly promise: Promise<WorkerShutdown>
  reject(reason: unknown): void
  resolve(shutdown: WorkerShutdown): void
}

/**
 * A ponte entre o handler de sinal, que existe desde o começo do boot, e o desligamento, que só
 * existe no fim dele. Sinal que chegar no meio espera aqui.
 */
export function createDeferredShutdown(): DeferredShutdown {
  let resolvePromise: ((shutdown: WorkerShutdown) => void) | undefined
  let rejectPromise: ((reason: unknown) => void) | undefined
  const promise = new Promise<WorkerShutdown>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  // Boot que falha rejeita esta promessa mesmo quando nenhum sinal chegou, e ninguém estaria
  // ouvindo: sem este consumidor, a rejeição derrubaria o processo por cima do erro que o próprio
  // boot já está propagando.
  promise.catch(() => undefined)

  return {
    promise,
    reject(reason: unknown): void {
      rejectPromise?.(reason)
    },
    resolve(shutdown: WorkerShutdown): void {
      resolvePromise?.(shutdown)
    },
  }
}
