/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Entrada da `worker_thread` do rosto da CNH. Pelo mesmo motivo da leitura do anexo (ADR-0053): pdf.js,
 * sharp e WASM sobre o documento de terceiro não rodam no processo principal, que também emite CT-e.
 *
 * Sem rede, sem banco e **sem log**: o que passa por aqui é o documento de uma pessoa (`security.md` §1).
 */
import { parentPort, workerData } from 'node:worker_threads'

import type { CnhFaceResult } from '../domain/cnh-face.types.js'
import { createCnhFaceExtractor } from './cnh-face-extractor.js'

export type CnhFaceWorkerData = Readonly<{ bytes: Uint8Array; modelPath: string }>

function silenceConsole(): void {
  const noop = (): void => undefined
  console.log = noop
  console.info = noop
  console.warn = noop
  console.error = noop
  console.debug = noop
}

async function run(input: CnhFaceWorkerData): Promise<CnhFaceResult> {
  const extractor = await createCnhFaceExtractor({ modelPath: input.modelPath })
  return extractor.extract(input.bytes)
}

if (parentPort !== null) {
  const port = parentPort
  silenceConsole()
  void run(workerData as CnhFaceWorkerData).then(
    (result) => {
      port.postMessage({ ok: true, result })
    },
    (error: unknown) => {
      /** Só a forma do erro atravessa: a mensagem do pdf.js cita conteúdo do arquivo. */
      port.postMessage({ ok: false, reason: error instanceof Error ? error.name : 'unknown' })
    },
  )
}
