/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Dono da thread permanente do OCR do canhoto: sobe na primeira foto (carrega os modelos uma vez),
 * atende **uma foto por vez** (concorrência 1: o pico de memória é de uma leitura) e tem teto de tempo —
 * estourou, a thread é encerrada e a próxima foto sobe outra. Fila curta: cheia, `busy`.
 */
import { Worker } from 'node:worker_threads'

import {
  CanhotoOcrError,
  type CanhotoOcrReaderPort,
  type ReadCanhotoParams,
} from '../application/canhoto-ocr-reader.port.js'
import { CANHOTO_OCR_DEFAULT_TIMEOUT_MILLISECONDS } from '../domain/canhoto-ocr.constant.js'
import type { CanhotoOcrResult } from '../domain/canhoto-ocr.types.js'
import type { CanhotoOcrThreadResponse } from './canhoto-ocr.worker.js'

const MAX_WAITING = 3

export const CANHOTO_OCR_WORKER_URL = import.meta.url.endsWith('.ts')
  ? new URL('./canhoto-ocr.worker.ts', import.meta.url)
  : new URL('./canhoto-ocr/infrastructure/canhoto-ocr.worker.js', import.meta.url)

export function createThreadedCanhotoOcrReader(
  options: Readonly<{
    modelDirectory: string
    timeoutMilliseconds?: number
    workerUrl?: URL
  }>,
): CanhotoOcrReaderPort {
  const timeoutMilliseconds =
    options.timeoutMilliseconds ?? CANHOTO_OCR_DEFAULT_TIMEOUT_MILLISECONDS
  let thread: Worker | undefined
  let tail: Promise<unknown> = Promise.resolve()
  let pending = 0
  let nextId = 0

  function spawn(): Worker {
    const created = new Worker(options.workerUrl ?? CANHOTO_OCR_WORKER_URL, {
      workerData: { modelDirectory: options.modelDirectory },
    })
    // A thread ociosa não segura o processo: o encerramento do worker não espera por ela.
    created.unref()
    created.once('exit', () => {
      if (thread === created) thread = undefined
    })
    return created
  }

  function run(params: ReadCanhotoParams): Promise<CanhotoOcrResult> {
    return new Promise((resolve, reject) => {
      const active = (thread ??= spawn())
      const id = (nextId += 1)
      const settle = (action: () => void): void => {
        clearTimeout(timer)
        active.off('message', onMessage)
        active.off('error', onError)
        active.off('exit', onExit)
        action()
      }
      const fail = (reason: 'engine_failed' | 'timeout'): void => {
        if (thread === active) thread = undefined
        void active.terminate()
        settle(() => reject(new CanhotoOcrError(reason)))
      }
      const timer = setTimeout(() => fail('timeout'), timeoutMilliseconds)
      const onMessage = (response: CanhotoOcrThreadResponse): void => {
        if (response.id !== id) return
        settle(() =>
          response.ok ? resolve(response.result) : reject(new CanhotoOcrError('engine_failed')),
        )
      }
      const onError = (): void => fail('engine_failed')
      const onExit = (): void => fail('engine_failed')
      active.on('message', onMessage)
      active.once('error', onError)
      active.once('exit', onExit)
      active.postMessage({ bytes: params.bytes, candidates: params.candidates, id })
    })
  }

  return {
    async close() {
      const closing = thread
      thread = undefined
      await closing?.terminate()
    },
    read(params) {
      if (pending > MAX_WAITING) return Promise.reject(new CanhotoOcrError('busy'))
      pending += 1
      const result = tail.then(() => run(params))
      tail = result.catch(() => undefined)
      return result.finally(() => {
        pending -= 1
      })
    },
  }
}
