/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Thread de teste com o protocolo da `canhoto-ocr.worker.ts`: avisa que está pronta (com atraso opcional, ou nunca) e
 * o primeiro byte da foto escolhe o desfecho.
 */
import { parentPort, workerData } from 'node:worker_threads'

type Request = Readonly<{ bytes: Uint8Array; id: number }>
type FakeOptions = Readonly<{ readyDelayMilliseconds?: number; neverReady?: boolean }>

const options = ((workerData as { fake?: FakeOptions } | undefined)?.fake ??
  {}) satisfies FakeOptions
if (options.neverReady !== true) {
  setTimeout(() => parentPort?.postMessage({ ready: true }), options.readyDelayMilliseconds ?? 0)
}

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
