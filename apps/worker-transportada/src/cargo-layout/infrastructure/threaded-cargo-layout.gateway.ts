/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma thread por planta, com teto de tempo. O prazo interno do empacotador é checado entre fatias; o
 * teto externo existe para a fatia patológica que não cede, e termina a thread.
 */
import { Worker } from 'node:worker_threads'
import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import { CARGO_LAYOUT_THREAD_CEILING_MARGIN_MS } from '../application/cargo-layout-budget.policy.js'
import type { CargoLayoutHandlerPorts } from '../application/cargo-layout-handler.service.js'
import { CargoLayoutThreadError } from '../application/cargo-layout-thread.error.js'
import { CargoLayoutTimeoutError } from '../application/cargo-layout-timeout.error.js'
import type { StoredCargoLayoutInput } from '../application/stored-cargo-layout-input.schema.js'

/**
 * Em desenvolvimento este módulo é `src/**` e a thread mora ao lado; empacotado ele vira
 * `dist/main.js`, e a thread fica onde o `bun build --root ./src` a gravou. `new Worker(url)` é
 * caminho de arquivo de verdade — o bundler não reescreve este `URL`. Contrato:
 * `test/build-entrypoints.contract.test.ts`.
 */
const WORKER_URL = import.meta.url.endsWith('.ts')
  ? new URL('./cargo-layout.worker.ts', import.meta.url)
  : new URL('./cargo-layout/infrastructure/cargo-layout.worker.js', import.meta.url)

type WorkerMessage =
  | { readonly layout: ResolvedCargoLayout | null; readonly ok: true }
  | { readonly code: string | undefined; readonly ok: false; readonly reason: string }

export function createThreadedCargoLayoutGateway(
  options: { readonly ceilingMarginMs?: number } = {},
): Pick<CargoLayoutHandlerPorts, 'compute'> {
  const ceilingMarginMs = options.ceilingMarginMs ?? CARGO_LAYOUT_THREAD_CEILING_MARGIN_MS

  return {
    compute: ({ budgetMs, input }) =>
      runInThread({ budgetMs, ceilingMs: budgetMs + ceilingMarginMs, input }),
  }
}

function runInThread(input: {
  readonly budgetMs: number
  readonly ceilingMs: number
  readonly input: StoredCargoLayoutInput
}): Promise<ResolvedCargoLayout | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, {
      workerData: { budgetMs: input.budgetMs, input: input.input },
    })

    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new CargoLayoutTimeoutError())
    }, input.ceilingMs)

    const settle = (action: () => void): void => {
      clearTimeout(timer)
      void worker.terminate()
      action()
    }

    worker.on('message', (message: WorkerMessage) => {
      settle(() =>
        message.ok
          ? resolve(message.layout)
          : reject(new CargoLayoutThreadError(message.reason, message.code)),
      )
    })
    worker.on('error', (error: Error) => {
      settle(() => reject(error))
    })
    /** Thread que morre sem mensagem é falha: silêncio não pode virar planta vazia. */
    worker.on('exit', (code: number) => {
      if (code !== 0) settle(() => reject(new Error(`cargo layout thread exited with ${code}`)))
    })
  })
}
