/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma thread por foto, com teto de tempo: estourou, a thread é encerrada e o trilho gasta uma
 * tentativa. O Bun ignora `resourceLimits`; o teto de memória são o de bytes e o de pixels (RNF1).
 */
import { Worker } from 'node:worker_threads'

import type {
  DeliveryProofImageParams,
  DeliveryProofImagePort,
  DeliveryProofImageResult,
} from '../application/delivery-proof-image.port.js'
import { PROOF_IMAGE_BUDGET_MILLISECONDS } from '../domain/delivery-proof-processing.constant.js'
import { DeliveryProofImageTimeoutError } from '../application/delivery-proof-processing.error.js'

const WORKER_URL = import.meta.url.endsWith('.ts')
  ? new URL('./delivery-proof-image.worker.ts', import.meta.url)
  : new URL(
      './delivery-proof-processing/infrastructure/delivery-proof-image.worker.js',
      import.meta.url,
    )

type WorkerMessage = Readonly<{ result: DeliveryProofImageResult }>

export function createThreadedDeliveryProofImageProcessor(
  options: { readonly budgetMilliseconds?: number } = {},
): DeliveryProofImagePort {
  const budgetMilliseconds = options.budgetMilliseconds ?? PROOF_IMAGE_BUDGET_MILLISECONDS

  return { process: (params) => runInThread({ budgetMilliseconds, params }) }
}

function runInThread(input: {
  readonly budgetMilliseconds: number
  readonly params: DeliveryProofImageParams
}): Promise<DeliveryProofImageResult> {
  return new Promise((resolve, reject) => {
    // Cópia: o buffer da leitura do objeto é transferido e some do chamador.
    const bytes = new Uint8Array(input.params.bytes)
    const worker = new Worker(WORKER_URL, {
      transferList: [bytes.buffer],
      workerData: { ...input.params, bytes },
    })

    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new DeliveryProofImageTimeoutError())
    }, input.budgetMilliseconds)

    const settle = (action: () => void): void => {
      clearTimeout(timer)
      void worker.terminate()
      action()
    }

    worker.on('message', (message: WorkerMessage) => {
      settle(() => resolve(message.result))
    })
    worker.on('error', (error: Error) => {
      settle(() => reject(error))
    })
    /** Thread que morre sem mensagem é falha de infraestrutura: silêncio não vira "imagem ilegível". */
    worker.on('exit', (code: number) => {
      if (code !== 0) {
        settle(() => reject(new Error(`delivery proof image thread exited with ${code}`)))
      }
    })
  })
}
