/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Thread de teste com o protocolo da `canhoto-ocr.worker.ts`: avisa que está pronta (com atraso opcional, ou nunca) e
 * o primeiro byte da foto escolhe o desfecho. Spec 344: no pedido `identity`, o segundo byte escolhe o que foi lido
 * (4 = sem Nº ancorado, 5 = foto que não abre, outro = Nº 172195 série 1).
 */
import { parentPort, workerData } from 'node:worker_threads'

type Request = Readonly<{ bytes: Uint8Array; id: number; kind?: 'identity' | 'match' }>
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
  if (request.kind === 'identity') {
    const read = request.bytes[1]
    parentPort?.postMessage({
      id: request.id,
      ok: true,
      result:
        read === 5
          ? { kind: 'unreadable' }
          : { identity: read === 4 ? null : { number: '172195', series: '1' }, kind: 'read' },
    })
    return
  }
  parentPort?.postMessage({
    id: request.id,
    ok: true,
    result: { ambiguous: false, candidates: [], markers: request.bytes[1] ?? 0 },
  })
})
