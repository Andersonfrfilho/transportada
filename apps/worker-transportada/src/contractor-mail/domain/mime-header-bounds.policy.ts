/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7a/T4.7c/T4.7d: o MIME só segue para o verificador de DKIM e para o leitor com o cabeçalho medido.
 * A seção inteira cabe em 64 KiB (sem fim de cabeçalho, recusa); cada campo DESDOBRADO cabe em 2 KiB (os que
 * identificam, e a soma dos repetidos de mesmo nome), 8 KiB (cada destinatário, 16 KiB na soma deles) ou 8 KiB
 * (os outros); as assinaturas têm teto de quantidade; e nome de campo com espaço exótico antes do `:` recusa, porque
 * a `mailauth` e o PostalMime separam esse campo de jeitos diferentes. Só lê o começo da mensagem: o corpo nunca
 * é percorrido aqui.
 */
import { MIME_HEADER_LIMITS } from './contractor-mail.constant.js'
import { readMimeHeaderFields, type MimeHeaderField } from './mime-header-fields.policy.js'

const HEADER_END_MARKERS = [Buffer.from('\r\n\r\n'), Buffer.from('\n\n')] as const
const LINE_BREAK = /\r?\n/u
const FIELD_NAME_LINE = /^[^ \t]/u
/** O que o `trim`/`\s` do JS tira das pontas do nome e a regra de campo da `mailauth` não conhece. */
const EXOTIC_SPACE = /[\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/u
const IDENTITY_HEADER_NAMES: ReadonlySet<string> = new Set(MIME_HEADER_LIMITS.identityHeaderNames)
const RECIPIENT_HEADER_NAMES: ReadonlySet<string> = new Set(MIME_HEADER_LIMITS.recipientHeaderNames)
const SIGNATURE_LIMITS: ReadonlyMap<string, number> = new Map(
  Object.entries(MIME_HEADER_LIMITS.maxSignatureFields),
)

export function hasBoundedMimeHeaders(raw: Uint8Array): boolean {
  const section = readHeaderSection(raw)
  if (section === undefined) return false
  if (hasDivergentFieldName(section)) return false
  return fitsFieldLimits(readMimeHeaderFields(section.toString('latin1').split(LINE_BREAK)))
}

/** O terminador pode começar no último byte permitido: a janela lida passa do teto por esse trecho. */
function readHeaderSection(raw: Uint8Array): Buffer | undefined {
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
  return window.subarray(0, Math.min(...ends))
}

/** Lido byte a byte (latin1) e como UTF-8: o NBSP de dois bytes só é espaço na segunda leitura. */
function hasDivergentFieldName(section: Buffer): boolean {
  return (['latin1', 'utf8'] as const).some((encoding) =>
    section
      .toString(encoding)
      .split(LINE_BREAK)
      .some((line) => {
        if (!FIELD_NAME_LINE.test(line)) return false
        const colon = line.indexOf(':')
        return colon > 0 && EXOTIC_SPACE.test(line.slice(0, colon))
      }),
  )
}

type FieldTotals = {
  identityBytes: Map<string, number>
  occurrences: Map<string, number>
  recipientBytes: number
}

function fitsFieldLimits(fields: readonly MimeHeaderField[]): boolean {
  const totals: FieldTotals = {
    identityBytes: new Map(),
    occurrences: new Map(),
    recipientBytes: 0,
  }
  return fields.every((field) => fitsField(field, totals))
}

function fitsField(field: MimeHeaderField, totals: FieldTotals): boolean {
  if (field.bytes > limitFor(field.name)) return false
  if (IDENTITY_HEADER_NAMES.has(field.name)) {
    const total = (totals.identityBytes.get(field.name) ?? 0) + field.bytes
    totals.identityBytes.set(field.name, total)
    if (total > MIME_HEADER_LIMITS.maxIdentityHeaderBytes) return false
  }
  if (RECIPIENT_HEADER_NAMES.has(field.name)) {
    totals.recipientBytes += field.bytes
    if (totals.recipientBytes > MIME_HEADER_LIMITS.maxRecipientHeadersTotalBytes) return false
  }
  const signatureLimit = SIGNATURE_LIMITS.get(field.name)
  if (signatureLimit === undefined) return true
  const count = (totals.occurrences.get(field.name) ?? 0) + 1
  totals.occurrences.set(field.name, count)
  return count <= signatureLimit
}

function limitFor(name: string): number {
  if (IDENTITY_HEADER_NAMES.has(name)) return MIME_HEADER_LIMITS.maxIdentityHeaderBytes
  if (RECIPIENT_HEADER_NAMES.has(name)) return MIME_HEADER_LIMITS.maxRecipientHeaderBytes
  return MIME_HEADER_LIMITS.maxHeaderBytes
}
