/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (RF4): o anexo da prévia por e-mail passa pelo MESMO critério do upload — teto de
 * 960 KiB e assinatura zip nos bytes, nunca a extensão nem o `Content-Type`. Exatamente um anexo
 * candidato: parte `inline` (logo de assinatura) não conta, a mensagem anexada é tratada à parte, e
 * qualquer outro anexo torna o e-mail ambíguo — nenhum outro anexo é lido.
 */
import type { CargoPreviewEmailRejectionCode } from '../../shared/cargo-preview.constant.js'
import { CARGO_PREVIEW_OBJECT_MAX_BYTES } from '../../cargo-preview/domain/cargo-preview-object.policy.js'
import {
  PREVIEW_EMAIL_FALLBACK_FILE_NAME,
  RFC822_MIME_TYPE,
} from './cargo-preview-email.constant.js'
import { hasZipSignature, sanitizePreviewFileName } from './preview-upload-file.policy.js'

export type CandidateAttachment = {
  readonly bytes: Uint8Array
  readonly disposition: string | null
  readonly fileName: string | null
  readonly mimeType: string
}

export type WorkbookSelection =
  | { readonly bytes: Uint8Array; readonly fileName: string; readonly kind: 'found' }
  | { readonly code: CargoPreviewEmailRejectionCode; readonly kind: 'rejected' }

export function selectPreviewWorkbook(
  attachments: readonly CandidateAttachment[],
): WorkbookSelection {
  const candidates = attachments.filter(isCandidate)
  const [candidate] = candidates
  if (candidate === undefined) return { code: 'ATTACHMENT_MISSING', kind: 'rejected' }
  if (candidates.length > 1) return { code: 'ATTACHMENT_AMBIGUOUS', kind: 'rejected' }
  if (candidate.bytes.byteLength > CARGO_PREVIEW_OBJECT_MAX_BYTES) {
    return { code: 'ATTACHMENT_TOO_LARGE', kind: 'rejected' }
  }
  if (!hasZipSignature(candidate.bytes)) {
    return { code: 'ATTACHMENT_NOT_A_WORKBOOK', kind: 'rejected' }
  }
  return {
    bytes: candidate.bytes,
    fileName:
      candidate.fileName === null
        ? PREVIEW_EMAIL_FALLBACK_FILE_NAME
        : sanitizeName(candidate.fileName),
    kind: 'found',
  }
}

function isCandidate(attachment: CandidateAttachment): boolean {
  if (attachment.disposition === 'inline') return false
  return attachment.mimeType.split(';')[0]?.trim().toLowerCase() !== RFC822_MIME_TYPE
}

function sanitizeName(rawName: string): string {
  const name = sanitizePreviewFileName(rawName)
  return name === 'preview' ? PREVIEW_EMAIL_FALLBACK_FILE_NAME : name
}
