/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: quais anexos de um e-mail ou de uma mensagem entram na importação. Só `.xml`, `.zip` e `.rar` (este último vira zip na
 * entrada, spec 307); o resto é ignorado com motivo, sem derrubar o lote. A extensão decide — o tipo MIME que o remetente declara
 * varia muito (`application/x-zip-compressed`, `text/plain`) e não é fronteira de segurança: o conteúdo é validado
 * quando o worker abre o arquivo.
 */
import { NFE_XML_RECEIPT_LIMITS } from './nfe-xml-receipt.constant.js'

export type ReceivedFileCandidate = {
  readonly contentType?: string | undefined
  readonly name: string
  readonly sizeBytes: number
}

export const RECEIVED_FILE_SKIP_REASON = {
  empty: 'empty',
  notXmlOrZip: 'not_xml_or_zip',
  tooLarge: 'file_too_large',
} as const
export type ReceivedFileSkipReason =
  (typeof RECEIVED_FILE_SKIP_REASON)[keyof typeof RECEIVED_FILE_SKIP_REASON]

export type ReceivedFileClassification<TFile extends ReceivedFileCandidate> = {
  readonly accepted: readonly TFile[]
  readonly skipped: readonly { readonly file: TFile; readonly reason: ReceivedFileSkipReason }[]
}

export function classifyReceivedFiles<TFile extends ReceivedFileCandidate>(
  files: readonly TFile[],
  maxFileBytes: number = NFE_XML_RECEIPT_LIMITS.maxFileBytes,
): ReceivedFileClassification<TFile> {
  const accepted: TFile[] = []
  const skipped: { file: TFile; reason: ReceivedFileSkipReason }[] = []
  for (const file of files) {
    const name = file.name.trim().toLowerCase()
    if (!name.endsWith('.xml') && !name.endsWith('.zip') && !name.endsWith('.rar')) {
      skipped.push({ file, reason: RECEIVED_FILE_SKIP_REASON.notXmlOrZip })
    } else if (file.sizeBytes <= 0) {
      skipped.push({ file, reason: RECEIVED_FILE_SKIP_REASON.empty })
    } else if (file.sizeBytes > maxFileBytes) {
      skipped.push({ file, reason: RECEIVED_FILE_SKIP_REASON.tooLarge })
    } else {
      accepted.push(file)
    }
  }
  return { accepted, skipped }
}

/** O tipo que a importação grava: o da tela, decidido pela extensão. */
export function contentTypeForReceivedFile(name: string): 'application/xml' | 'application/zip' {
  return name.trim().toLowerCase().endsWith('.zip') ? 'application/zip' : 'application/xml'
}

/** O nome vira trilha e chave de objeto: sem caminho, sem controle, com teto. */
export function sanitizeReceivedFileName(name: string): string {
  const base = name.split(/[\\/]/u).pop() ?? ''
  // eslint-disable-next-line no-control-regex -- é exatamente o controle que se quer tirar do nome
  const cleaned = base.replaceAll(/[\u0000-\u001f\u007f]/gu, '').trim()
  return (cleaned === '' ? 'arquivo' : cleaned).slice(0, 180)
}
