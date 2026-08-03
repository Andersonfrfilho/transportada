/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  COMPANY_LOGO_MAX_BYTES,
  type CompanyLogoMimeType,
} from '../../database/company-logo.schema.js'
import {
  CompanyLogoTooLargeError,
  CompanyLogoUnsupportedFormatError,
} from './company-logo.error.js'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const

/** O tipo declarado no multipart vem do cliente; só a assinatura do arquivo decide o que o pdfkit vai receber. */
export function detectCompanyLogoMimeType(bytes: Uint8Array): CompanyLogoMimeType | null {
  if (startsWith({ bytes, signature: PNG_SIGNATURE })) return 'image/png'
  if (startsWith({ bytes, signature: JPEG_SIGNATURE })) return 'image/jpeg'
  return null
}

export function assertCompanyLogoBytes(bytes: Uint8Array): CompanyLogoMimeType {
  if (bytes.byteLength > COMPANY_LOGO_MAX_BYTES) throw new CompanyLogoTooLargeError()
  const mimeType = detectCompanyLogoMimeType(bytes)
  if (mimeType === null) throw new CompanyLogoUnsupportedFormatError()
  return mimeType
}

function startsWith(input: {
  readonly bytes: Uint8Array
  readonly signature: readonly number[]
}): boolean {
  if (input.bytes.byteLength < input.signature.length) return false
  return input.signature.every((byte, index) => input.bytes[index] === byte)
}
