/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { AggregateDocumentInvalidUploadError } from './aggregate-document.error.js'

export const AGGREGATE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46] as const

export type AggregateDocumentMimeType = 'application/pdf' | 'image/jpeg' | 'image/png'

/** O tipo declarado no upload vem do cliente; só a assinatura do arquivo decide o que é gravado. */
export function detectAggregateDocumentMimeType(
  bytes: Uint8Array,
): AggregateDocumentMimeType | null {
  if (startsWith({ bytes, signature: PNG_SIGNATURE })) return 'image/png'
  if (startsWith({ bytes, signature: JPEG_SIGNATURE })) return 'image/jpeg'
  if (startsWith({ bytes, signature: PDF_SIGNATURE })) return 'application/pdf'
  return null
}

export function assertAggregateDocumentBytes(bytes: Uint8Array): AggregateDocumentMimeType {
  if (bytes.byteLength === 0 || bytes.byteLength > AGGREGATE_DOCUMENT_MAX_BYTES) {
    throw new AggregateDocumentInvalidUploadError()
  }
  const mimeType = detectAggregateDocumentMimeType(bytes)
  if (mimeType === null) throw new AggregateDocumentInvalidUploadError()
  return mimeType
}

function startsWith(input: {
  readonly bytes: Uint8Array
  readonly signature: readonly number[]
}): boolean {
  if (input.bytes.byteLength < input.signature.length) return false
  return input.signature.every((byte, index) => input.bytes[index] === byte)
}
