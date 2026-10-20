/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma thread por anexo, com teto de tempo. Thread reaproveitada guardaria estado do pdf.js entre
 * documentos de pessoas diferentes; o custo de subir uma é irrisório perto do parse.
 */
import { Worker } from 'node:worker_threads'

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
const WORKER_URL = import.meta.url.endsWith('.ts')
  ? new URL('./pdf-extraction.worker.ts', import.meta.url)
  : // Empacotado, este código é `dist/main.js`: a thread fica onde o `bun build --root ./src` a gravou
    new URL('./aggregate-attachment/infrastructure/pdf-extraction.worker.js', import.meta.url)

type WorkerMessage =
  | {
      readonly ok: true
      readonly result: { readonly fields: Record<string, unknown> | null; readonly text?: string }
    }
  | { readonly ok: false; readonly reason: string }

export function createThreadedAttachmentExtractionGateway(): AttachmentExtractionPort {
  return {
    async extract({ bytes, type }) {
      return (await runInThread({ bytes, type }, EXTRACTION_TIMEOUT_MS)).fields
    },
  }
}

/**
 * Spec 276 T2: o texto da primeira página de um PDF da contratante, para a conferência do boleto. A mesma
 * thread do anexo do agregado (ADR-0053: pdf.js nunca no processo principal), com prazo curto: o boleto é
 * gerado por sistema e lê em milissegundos. Falha ou prazo estourado é texto vazio — o retorno vai ao
 * operador, nunca segue sem conferência.
 */
export async function readPdfTextInThread(bytes: Uint8Array): Promise<string> {
  try {
    const result = await runInThread({ bytes, mode: 'text', type: 'pdf_text' }, TEXT_TIMEOUT_MS)
    return result.text ?? ''
  } catch {
    return ''
  }
}

const TEXT_TIMEOUT_MS = 10_000

function runInThread(
  workerData: { readonly bytes: Uint8Array; readonly mode?: 'text'; readonly type: string },
  timeoutMs: number,
): Promise<{ readonly fields: Readonly<Record<string, unknown>> | null; readonly text?: string }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { workerData })

    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new Error('aggregate attachment extraction timed out'))
    }, timeoutMs)

    const settle = (action: () => void): void => {
      clearTimeout(timer)
      void worker.terminate()
      action()
    }

    worker.on('message', (message: WorkerMessage) => {
      settle(() =>
        message.ok
          ? resolve(message.result)
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
