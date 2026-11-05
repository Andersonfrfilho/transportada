/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Thread **permanente** do canhoto (ADR 0113 §5): os modelos carregam uma vez, ao subir, e a thread fica
 * viva atendendo uma foto por vez. Decodificar e ler 12 MP é CPU e memória (~740 MB de pico medido no
 * spike) e no processo principal pararia a emissão fiscal junto. Sem rede, sem banco e **sem log**.
 */
import { parentPort, workerData } from 'node:worker_threads'

import { evaluateCanhotoText } from '../domain/canhoto-ocr-match.policy.js'
import type { CanhotoOcrCandidate, CanhotoOcrResult } from '../domain/canhoto-ocr.types.js'
import { loadOcrEngine, readOcrLines } from './paddle-ocr.engine.js'

export type CanhotoOcrThreadRequest = Readonly<{
  bytes: Uint8Array
  candidates: readonly CanhotoOcrCandidate[]
  id: number
}>
export type CanhotoOcrThreadResponse = Readonly<
  { id: number; ok: true; result: CanhotoOcrResult } | { id: number; ok: false }
>
/** Spec 294 C6: a thread avisa uma vez, quando os modelos terminaram de carregar. */
export type CanhotoOcrThreadReady = Readonly<{ ready: true }>

if (parentPort !== null) {
  const port = parentPort
  const engine = await loadOcrEngine((workerData as { modelDirectory: string }).modelDirectory)
  port.postMessage({ ready: true } satisfies CanhotoOcrThreadReady)
  port.on('message', (request: CanhotoOcrThreadRequest) => {
    void readOcrLines(engine, request.bytes)
      .then((lines) =>
        evaluateCanhotoText({
          candidates: request.candidates,
          lines: lines.map((line) => line.text),
        }),
      )
      .then(
        (result) => port.postMessage({ id: request.id, ok: true, result }),
        () => port.postMessage({ id: request.id, ok: false }),
      )
  })
}
