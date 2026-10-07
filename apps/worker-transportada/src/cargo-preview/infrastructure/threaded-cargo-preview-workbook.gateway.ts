/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma thread por planilha, com teto de tempo: estourou, a thread é terminada e a prévia é
 * `PREVIEW_PARSE_TIMEOUT` — o arquivo é o problema, então não volta para a fila.
 */
import { Worker } from 'node:worker_threads'

import type {
  CargoPreviewWorkbookReaderPort,
  PreviewReadingProfile,
  PreviewWorkbookReading,
} from '../application/cargo-preview-worker.port.js'
import {
  CARGO_PREVIEW_READ_THREAD_CEILING_MS,
  CARGO_PREVIEW_READ_THREAD_HEAP_MB,
} from '../domain/cargo-preview-thread.constant.js'

/** Empacotado, a thread fica onde o `bun build --root ./src` a gravou (`build-entrypoints`). */
const WORKER_URL = import.meta.url.endsWith('.ts')
  ? new URL('./cargo-preview-workbook.worker.ts', import.meta.url)
  : new URL('./cargo-preview/infrastructure/cargo-preview-workbook.worker.js', import.meta.url)

const TIMEOUT_READING: PreviewWorkbookReading = { code: 'PREVIEW_PARSE_TIMEOUT' }

export function createThreadedCargoPreviewWorkbookReader(
  options: { readonly ceilingMs?: number } = {},
): CargoPreviewWorkbookReaderPort {
  const ceilingMs = options.ceilingMs ?? CARGO_PREVIEW_READ_THREAD_CEILING_MS
  return { read: (input) => readInThread({ ...input, ceilingMs }) }
}

function readInThread(input: {
  readonly bytes: Uint8Array
  readonly ceilingMs: number
  readonly profile: PreviewReadingProfile
}): Promise<PreviewWorkbookReading> {
  return new Promise((resolve, reject) => {
    const bytes = new Uint8Array(input.bytes)
    const worker = new Worker(WORKER_URL, {
      resourceLimits: { maxOldGenerationSizeMb: CARGO_PREVIEW_READ_THREAD_HEAP_MB },
      transferList: [bytes.buffer],
      workerData: { bytes, profile: input.profile },
    })
    const timer = setTimeout(() => {
      void worker.terminate()
      resolve(TIMEOUT_READING)
    }, input.ceilingMs)
    const settle = (action: () => void): void => {
      clearTimeout(timer)
      void worker.terminate()
      action()
    }
    worker.on('message', (reading: PreviewWorkbookReading) => settle(() => resolve(reading)))
    worker.on('error', (error: Error) => settle(() => reject(error)))
    /** Thread que morre sem mensagem é falha nossa: silêncio não pode virar prévia lida. */
    worker.on('exit', (code: number) => {
      if (code !== 0) settle(() => reject(new Error(`cargo preview thread exited with ${code}`)))
    })
  })
}
