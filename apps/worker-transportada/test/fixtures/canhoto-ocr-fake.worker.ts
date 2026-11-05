/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Thread de teste com o protocolo da `canhoto-ocr.worker.ts`: o primeiro byte da foto escolhe o desfecho.
 */
import { parentPort } from 'node:worker_threads'

type Request = Readonly<{ bytes: Uint8Array; id: number }>

parentPort?.on('message', (request: Request) => {
  const behavior = request.bytes[0]
  if (behavior === 2) return
  if (behavior === 3) {
    parentPort?.postMessage({ id: request.id, ok: false })
    return
  }
  parentPort?.postMessage({
    id: request.id,
    ok: true,
    result: { ambiguous: false, candidates: [], markers: request.bytes[1] ?? 0 },
  })
})
