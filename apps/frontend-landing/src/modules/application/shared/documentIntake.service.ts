/* Copyright (c) 2026 Ada Technology. MIT License. */

import {
  identifyDocumentKind,
  readPdfTextLayer,
  type DocumentKind,
  type PdfGetDocument,
} from '@adatechnology/document-intake'

import { readCcmei, type CcmeiRemark, type CcmeiValues } from './ccmei.service'

/**
 * Spec 066 (P2): a leitura acontece **no navegador de quem anexa** — sem requisição, sem origem
 * nova na CSP e sem nada gravado. O arquivo vive na memória da aba e morre com ela.
 *
 * Um caso de uso, sem React, sem rede e **sem log** — nem em `debug`: o que passa por aqui é o
 * documento de uma pessoa, com CPF, RG e endereço impressos. A regra de privacidade da 048 só vale
 * se a PII não vazar por um `console.log` esquecido.
 */
export type CompanyDocumentReading = Readonly<{
  kind: DocumentKind
  remarks: readonly CcmeiRemark[]
  values: Partial<CcmeiValues>
}>

/**
 * Documento que não é CCMEI **não preenche campo nenhum**, mesmo trazendo um CNPJ impresso: ler
 * campo de documento não identificado é inventar dado com aparência de leitura. Ele ainda anexa —
 * como "outro documento" —, e quem decide o que fazer com ele é o operador na fila de revisão.
 */
const NOTHING_READ = { remarks: [], values: {} } as const

export async function readCompanyDocument(input: {
  data: Uint8Array
  getDocument: PdfGetDocument
}): Promise<CompanyDocumentReading> {
  const page = await readPdfTextLayer(input)
  const kind = identifyDocumentKind(page)
  if (kind !== 'ccmei') return { ...NOTHING_READ, kind }

  return { ...readCcmei(page), kind }
}

/** O arquivo vira bytes na memória da aba: nada de `FileReader` mandando conteúdo para lugar nenhum. */
export async function toDocumentBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}
