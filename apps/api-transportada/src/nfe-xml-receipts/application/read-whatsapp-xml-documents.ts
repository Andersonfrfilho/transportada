/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: o documento `.xml`/`.zip` de cada mensagem, lido do corpo cru de `messages.upsert` (o SDK 0.3.0 só lê texto).
 * Documento que não é XML nem zip nem entra: um PDF mandado ao bot continua sendo ignorado como sempre foi.
 */
export type WhatsAppXmlDocument = {
  readonly fileName: string
  readonly mentionedJids: readonly string[]
  readonly mimeType: string
  readonly rawMessage: { readonly key: unknown; readonly message: unknown }
  readonly sizeBytes: number
}

const ACCEPTED_NAME = /\.(?:xml|zip)$/iu
const ACCEPTED_MIME = new Set([
  'application/xml',
  'application/zip',
  'application/x-zip-compressed',
  'text/xml',
])
const FALLBACK_NAME_BY_MIME: Readonly<Record<string, string>> = {
  'application/x-zip-compressed': 'arquivo.zip',
  'application/xml': 'arquivo.xml',
  'application/zip': 'arquivo.zip',
  'text/xml': 'arquivo.xml',
}

export function readWhatsAppXmlDocuments(
  payload: unknown,
): ReadonlyMap<string, WhatsAppXmlDocument> {
  const result = new Map<string, WhatsAppXmlDocument>()
  if (!isRecord(payload)) return result
  const items: unknown[] = Array.isArray(payload.data) ? payload.data : [payload.data]
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.key) || !isRecord(item.message)) continue
    const id = item.key.id
    if (typeof id !== 'string') continue
    const document = documentOf(item.message)
    if (document === null) continue
    const mimeType =
      typeof document.mimetype === 'string'
        ? document.mimetype.split(';')[0]!.trim().toLowerCase()
        : ''
    const declaredName = firstText(document.fileName, document.title)
    const fileName =
      declaredName !== null && ACCEPTED_NAME.test(declaredName)
        ? declaredName
        : declaredName === null
          ? (FALLBACK_NAME_BY_MIME[mimeType] ?? null)
          : null
    if (fileName === null || (!ACCEPTED_NAME.test(fileName) && !ACCEPTED_MIME.has(mimeType)))
      continue
    const contexts = [document.contextInfo, item.contextInfo].filter(isRecord)
    result.set(id, {
      fileName,
      mentionedJids: contexts.flatMap((context) =>
        Array.isArray(context.mentionedJid)
          ? context.mentionedJid.filter((jid): jid is string => typeof jid === 'string')
          : [],
      ),
      mimeType: mimeType === '' ? 'application/octet-stream' : mimeType,
      rawMessage: { key: item.key, message: item.message },
      sizeBytes: lengthOf(document.fileLength),
    })
  }
  return result
}

function documentOf(message: Record<string, unknown>): Record<string, unknown> | null {
  if (isRecord(message.documentMessage)) return message.documentMessage
  const wrapped = message.documentWithCaptionMessage
  if (isRecord(wrapped) && isRecord(wrapped.message) && isRecord(wrapped.message.documentMessage)) {
    return wrapped.message.documentMessage
  }
  return null
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

/** `fileLength` vem como número, texto ou `{ low, high }` (Long do protobuf). */
function lengthOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/u.test(value)) return Number(value)
  if (isRecord(value) && typeof value.low === 'number') {
    const high = typeof value.high === 'number' ? value.high : 0
    return high * 2 ** 32 + (value.low >>> 0)
  }
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
