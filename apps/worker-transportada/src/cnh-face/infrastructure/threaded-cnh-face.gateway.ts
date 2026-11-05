/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma thread por documento, com teto de tempo: thread reaproveitada guardaria estado de pdf.js e do
 * modelo entre pessoas diferentes, e subir uma custa ~0,2 s (spike 295), irrisório para um evento por cadastro.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import type { CnhFaceExtractionPort } from '../application/cnh-face.port.js'
import type { CnhFaceResult } from '../domain/cnh-face.types.js'

const EXTRACTION_TIMEOUT_MS = 30_000

/** Onde o `bun build --root ./src` grava a thread, relativo a `dist/`. */
const BUNDLED_WORKER_PATH = './cnh-face/infrastructure/cnh-face.worker.js'
const MODEL_RELATIVE_PATH = join('assets', 'ultraface-rfb-320.onnx')

/**
 * Um ponto de apoio só: a pasta do pacote do worker, achada subindo até a que tem `assets/` com o modelo.
 * `import.meta.url` muda conforme o empacotado (`dist/main.js`, `dist/cnh-face/*.main.js`, `src/*.ts`), a raiz não.
 */
export function resolveCnhFacePaths(moduleUrl: string): {
  readonly modelPath: string
  readonly workerPath: string
} {
  const modulePath = fileURLToPath(moduleUrl)
  let directory = dirname(modulePath)
  for (;;) {
    const modelPath = join(directory, MODEL_RELATIVE_PATH)
    if (existsSync(modelPath)) {
      const workerPath = modulePath.endsWith('.ts')
        ? join(dirname(modulePath), 'cnh-face.worker.ts')
        : join(directory, 'dist', BUNDLED_WORKER_PATH)
      return { modelPath, workerPath }
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error('cnh face model directory not found')
    directory = parent
  }
}

type WorkerMessage =
  | { readonly ok: true; readonly result: CnhFaceResult }
  | { readonly ok: false; readonly reason: string }

export function resolveCnhFaceModelPath(): string {
  return resolveCnhFacePaths(import.meta.url).modelPath
}

export function createThreadedCnhFaceGateway(
  params: { readonly modelPath?: string } = {},
): CnhFaceExtractionPort {
  const paths = resolveCnhFacePaths(import.meta.url)
  const modelPath = params.modelPath ?? paths.modelPath
  return {
    extract: (bytes) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(paths.workerPath, { workerData: { bytes, modelPath } })
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
