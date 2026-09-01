/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Entrada da `worker_thread`. **É o único lugar do worker que carrega pdf.js**, e é assim de
 * propósito (ADR-0053): o parse de um PDF de terceiro é CPU num runtime de um event loop só, e
 * dentro do processo principal ele pararia a emissão de CT-e, MDF-e e NFS-e junto.
 *
 * Sem rede, sem banco e **sem log** — nem em `debug`. O que passa por aqui é o documento de uma
 * pessoa, com CPF, RG e endereço impressos (`security.md` §1).
 *
 * Usa o build `legacy/` do pdf.js: o normal quebra fora do navegador (`DOMMatrix is not defined`).
 */
import { parentPort, workerData } from 'node:worker_threads'
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  identifyDocumentKind,
  readCcmei,
  readPdfTextLayer,
  type PdfGetDocument,
} from '@adatechnology/document-intake'

const getDocument = pdfjsLegacy.getDocument as unknown as PdfGetDocument

/**
 * O pdf.js escreve avisos direto no console ("Indexing all PDF objects", fontes que faltam), e daqui
 * eles cairiam no stdout do processo — que é log. Medido: o aviso sai com PDF real. A regra é não
 * logar nada do documento de ninguém, e a forma barata de garanti-la é o canal não existir.
 */
function silenceConsole(): void {
  const noop = (): void => undefined
  console.log = noop
  console.info = noop
  console.warn = noop
  console.error = noop
  console.debug = noop
}

export type PdfExtractionWorkerData = Readonly<{
  bytes: Uint8Array
  type: string
}>

export type PdfExtractionWorkerResult = Readonly<{
  fields: Readonly<Record<string, unknown>> | null
}>

/**
 * O tipo declarado vem do cliente anônimo — ele diz `ccmei` e manda outra coisa. Quem decide o mapa
 * é o **documento**, pelo título na faixa superior; ler com o mapa errado produziria campos
 * inventados, e campo inventado vira divergência falsa contra a ficha de quem se candidatou.
 */
export async function extractAttachmentFields(
  input: PdfExtractionWorkerData,
): Promise<PdfExtractionWorkerResult> {
  if (input.type !== 'ccmei') return { fields: null }

  const page = await readPdfTextLayer({ data: input.bytes, getDocument })
  if (identifyDocumentKind(page) !== 'ccmei') return { fields: null }

  const reading = readCcmei(page)
  return { fields: Object.keys(reading.values).length === 0 ? null : { ...reading.values } }
}

if (parentPort !== null) {
  const port = parentPort
  silenceConsole()
  void extractAttachmentFields(workerData as PdfExtractionWorkerData).then(
    (result) => {
      port.postMessage({ ok: true, result })
    },
    (error: unknown) => {
      /**
       * Só a **forma** do erro atravessa, nunca a mensagem do pdf.js: ela cita conteúdo do arquivo,
       * e conteúdo do arquivo é o documento de uma pessoa.
       */
      port.postMessage({ ok: false, reason: error instanceof Error ? error.name : 'unknown' })
    },
  )
}
