/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7a/T4.7c: o MIME só segue para o verificador de DKIM e para o leitor com o cabeçalho medido. A
 * seção inteira cabe em 64 KiB (sem fim de cabeçalho, recusa); cada campo DESDOBRADO cabe em 2 KiB (os de
 * endereço, e a soma dos repetidos de mesmo nome) ou 8 KiB (os outros); e as assinaturas têm teto de quantidade.
 * Só lê o começo da mensagem: o corpo nunca é percorrido aqui.
 */
import { MIME_HEADER_LIMITS } from './contractor-mail.constant.js'
import { readMimeHeaderFields, type MimeHeaderField } from './mime-header-fields.policy.js'

const HEADER_END_MARKERS = [Buffer.from('\r\n\r\n'), Buffer.from('\n\n')] as const
const LINE_BREAK = /\r?\n/u
const ADDRESS_HEADER_NAMES: ReadonlySet<string> = new Set(MIME_HEADER_LIMITS.addressHeaderNames)
const SIGNATURE_LIMITS: ReadonlyMap<string, number> = new Map(
  Object.entries(MIME_HEADER_LIMITS.maxSignatureFields),
)

export function hasBoundedMimeHeaders(raw: Uint8Array): boolean {
  const section = readHeaderSection(raw)
  if (section === undefined) return false
  return fitsFieldLimits(readMimeHeaderFields(section.split(LINE_BREAK)))
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

function fitsFieldLimits(fields: readonly MimeHeaderField[]): boolean {
  const addressBytes = new Map<string, number>()
  const occurrences = new Map<string, number>()
  for (const field of fields) {
    const isAddress = ADDRESS_HEADER_NAMES.has(field.name)
    const limit = isAddress
      ? MIME_HEADER_LIMITS.maxAddressHeaderBytes
      : MIME_HEADER_LIMITS.maxHeaderBytes
    if (field.bytes > limit) return false
    if (isAddress) {
      const total = (addressBytes.get(field.name) ?? 0) + field.bytes
      if (total > limit) return false
      addressBytes.set(field.name, total)
    }
    const signatureLimit = SIGNATURE_LIMITS.get(field.name)
    if (signatureLimit === undefined) continue
    const count = (occurrences.get(field.name) ?? 0) + 1
    if (count > signatureLimit) return false
    occurrences.set(field.name, count)
  }
  return true
}
