/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7a: o MIME só segue para o verificador de DKIM com o cabeçalho medido. A seção inteira cabe
 * em 64 KiB (sem fim de cabeçalho, recusa) e cada linha DESDOBRADA dos cabeçalhos de endereço, em 2 KiB.
 * Só lê o começo da mensagem: o corpo nunca é percorrido aqui.
 */
import { MIME_HEADER_LIMITS } from './contractor-mail.constant.js'

const HEADER_END_MARKERS = [Buffer.from('\r\n\r\n'), Buffer.from('\n\n')] as const
const LINE_BREAK = /\r?\n/u
const FOLDED_LINE = /^[ \t]/u
const ADDRESS_HEADER_NAMES: ReadonlySet<string> = new Set(MIME_HEADER_LIMITS.addressHeaderNames)

export function hasBoundedMimeHeaders(raw: Uint8Array): boolean {
  const section = readHeaderSection(raw)
  return section !== undefined && fitsAddressHeaderLimit(section)
}

/** O terminador pode começar no último byte permitido: a janela lida passa do teto por esse trecho. */
function readHeaderSection(raw: Uint8Array): string | undefined {
  const { maxSectionBytes } = MIME_HEADER_LIMITS
  const window = Buffer.from(
    raw.buffer,
    raw.byteOffset,
    Math.min(raw.byteLength, maxSectionBytes + HEADER_END_MARKERS[0].byteLength),
  )
  const ends = HEADER_END_MARKERS.map((marker) => window.indexOf(marker)).filter(
    (index) => index >= 0 && index <= maxSectionBytes,
  )
  if (ends.length === 0) return undefined
  return window.subarray(0, Math.min(...ends)).toString('latin1')
}

function fitsAddressHeaderLimit(section: string): boolean {
  let isAddressHeader = false
  let valueLength = 0
  for (const line of section.split(LINE_BREAK)) {
    if (FOLDED_LINE.test(line)) {
      valueLength += line.length
    } else {
      const colon = line.indexOf(':')
      isAddressHeader = colon > 0 && ADDRESS_HEADER_NAMES.has(line.slice(0, colon).toLowerCase())
      valueLength = line.length - colon - 1
    }
    if (isAddressHeader && valueLength > MIME_HEADER_LIMITS.maxAddressHeaderBytes) return false
  }
  return true
}
