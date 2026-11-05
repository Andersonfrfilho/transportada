/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma thread por documento, com teto de tempo: thread reaproveitada guardaria estado de pdf.js e do
 * modelo entre pessoas diferentes, e subir uma custa ~0,2 s (spike 295), irrisório para um evento por cadastro.
 */
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import type { CnhFaceExtractionPort } from '../application/cnh-face.port.js'
import type { CnhFaceResult } from '../domain/cnh-face.types.js'

const EXTRACTION_TIMEOUT_MS = 30_000

/** Em desenvolvimento a thread roda de `src/*.ts`; empacotado, este código é `dist/main.js` (ver `threaded-extraction.gateway.ts`). */
const WORKER_URL = import.meta.url.endsWith('.ts')
  ? new URL('./cnh-face.worker.ts', import.meta.url)
  : new URL('./cnh-face/infrastructure/cnh-face.worker.js', import.meta.url)

/** `apps/worker-transportada/assets/`: de `src/cnh-face/infrastructure/` são três níveis; de `dist/main.js`, um. */
const MODEL_URL = new URL(
  import.meta.url.endsWith('.ts')
    ? '../../../assets/ultraface-rfb-320.onnx'
    : '../assets/ultraface-rfb-320.onnx',
  import.meta.url,
)

type WorkerMessage =
  | { readonly ok: true; readonly result: CnhFaceResult }
  | { readonly ok: false; readonly reason: string }

export function resolveCnhFaceModelPath(): string {
  return fileURLToPath(MODEL_URL)
}

export function createThreadedCnhFaceGateway(
  params: { readonly modelPath?: string } = {},
): CnhFaceExtractionPort {
  const modelPath = params.modelPath ?? resolveCnhFaceModelPath()
  return {
    extract: (bytes) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_URL, { workerData: { bytes, modelPath } })
        const timer = setTimeout(() => {
          void worker.terminate()
          reject(new Error('cnh face extraction timed out'))
        }, EXTRACTION_TIMEOUT_MS)
        const settle = (action: () => void): void => {
          clearTimeout(timer)
          void worker.terminate()
          action()
        }

        worker.on('message', (message: WorkerMessage) => {
          settle(() =>
            message.ok
              ? resolve(message.result)
              : reject(new Error(`cnh face extraction failed: ${message.reason}`)),
          )
        })
        worker.on('error', (error: Error) => {
          settle(() => reject(error))
        })
        worker.on('exit', (code: number) => {
          if (code !== 0) settle(() => reject(new Error(`cnh face worker exited with ${code}`)))
        })
      }),
  }
}
