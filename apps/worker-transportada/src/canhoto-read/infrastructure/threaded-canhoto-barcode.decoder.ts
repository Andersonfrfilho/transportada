/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma thread por foto, com teto de tempo: estourou, a thread é encerrada e o chamador sabe que foi
 * prazo, não "sem código".
 */
import { Worker } from 'node:worker_threads'

import { CanhotoDecodeTimeoutError } from '../application/canhoto-decode-timeout.error.js'
import type {
  CanhotoBarcodeDecoderPort,
  DecodeCanhotoBarcodeParams,
} from '../application/canhoto-barcode-decoder.port.js'
import { CANHOTO_DECODE_BUDGET_MILLISECONDS } from '../domain/canhoto-read.constant.js'

const WORKER_URL = import.meta.url.endsWith('.ts')
  ? new URL('./canhoto-barcode.worker.ts', import.meta.url)
  : new URL('./canhoto-read/infrastructure/canhoto-barcode.worker.js', import.meta.url)

type WorkerMessage = Readonly<{ text: string | null }>

export function createThreadedCanhotoBarcodeDecoder(
  options: { readonly budgetMilliseconds?: number } = {},
): CanhotoBarcodeDecoderPort {
  const budgetMilliseconds = options.budgetMilliseconds ?? CANHOTO_DECODE_BUDGET_MILLISECONDS

  return { decode: (params) => runInThread({ budgetMilliseconds, params }) }
}

function runInThread(input: {
  readonly budgetMilliseconds: number
  readonly params: DecodeCanhotoBarcodeParams
}): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const bytes = new Uint8Array(input.params.bytes)
    const worker = new Worker(WORKER_URL, {
      transferList: [bytes.buffer],
      workerData: { bytes, mediaType: input.params.mediaType },
    })

    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new CanhotoDecodeTimeoutError())
    }, input.budgetMilliseconds)

    const settle = (action: () => void): void => {
      clearTimeout(timer)
      void worker.terminate()
      action()
    }

    worker.on('message', (message: WorkerMessage) => {
      settle(() => resolve(message.text))
    })
    worker.on('error', (error: Error) => {
      settle(() => reject(error))
    })
    /** Thread que morre sem mensagem é falha: silêncio não pode virar "sem código" e gravar a tentativa. */
    worker.on('exit', (code: number) => {
      if (code !== 0) settle(() => reject(new Error(`canhoto decode thread exited with ${code}`)))
    })
  })
}
