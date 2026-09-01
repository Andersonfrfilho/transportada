/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma thread por anexo, com teto de tempo. Thread reaproveitada guardaria estado do pdf.js entre
 * documentos de pessoas diferentes; o custo de subir uma é irrisório perto do parse.
 */
import { Worker } from 'node:worker_threads'

import type { AggregateAttachmentType } from '../../messaging/aggregate-attachment-envelope.schema.js'
import type { AttachmentExtractionPort } from '../application/extract-attachment-fields.port.js'

/**
 * Teto largo: PDF de CCMEI escaneado em página cheia leva segundos num contêiner apertado. Ele existe
 * para o arquivo patológico não segurar a thread para sempre, não para apertar o caso normal.
 */
const EXTRACTION_TIMEOUT_MS = 30_000

/**
 * A extensão sai do **próprio módulo**, não de uma constante: em desenvolvimento o worker roda de
 * `src/*.ts` e em produção de `dist/*.js`, e `new Worker(url)` é caminho de arquivo de verdade — o
 * runtime não reescreve `.js` para `.ts` como faz com `import`. Fixar uma das duas extensões quebra
 * exatamente o ambiente que não foi testado.
 */
const WORKER_URL = new URL(
  import.meta.url.endsWith('.ts') ? './pdf-extraction.worker.ts' : './pdf-extraction.worker.js',
  import.meta.url,
)

type WorkerMessage =
  | { readonly ok: true; readonly result: { readonly fields: Record<string, unknown> | null } }
  | { readonly ok: false; readonly reason: string }

export function createThreadedAttachmentExtractionGateway(): AttachmentExtractionPort {
  return {
    async extract({ bytes, type }) {
      return runInThread({ bytes, type })
    },
  }
}

function runInThread(input: {
  readonly bytes: Uint8Array
  readonly type: AggregateAttachmentType
}): Promise<Readonly<Record<string, unknown>> | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, {
      workerData: { bytes: input.bytes, type: input.type },
    })

    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new Error('aggregate attachment extraction timed out'))
    }, EXTRACTION_TIMEOUT_MS)

    const settle = (action: () => void): void => {
      clearTimeout(timer)
      void worker.terminate()
      action()
    }

    worker.on('message', (message: WorkerMessage) => {
      settle(() =>
        message.ok
          ? resolve(message.result.fields)
          : reject(new Error(`aggregate attachment extraction failed: ${message.reason}`)),
      )
    })
    worker.on('error', (error: Error) => {
      settle(() => reject(error))
    })
    /** Thread que morre sem mensagem é falha: silêncio não pode virar "não achei nada". */
    worker.on('exit', (code: number) => {
      if (code !== 0) settle(() => reject(new Error(`extraction worker exited with ${code}`)))
    })
  })
}
