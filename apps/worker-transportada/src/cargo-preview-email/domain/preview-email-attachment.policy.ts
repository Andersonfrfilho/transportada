/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoPreviewEmailRejectionCode } from '../../shared/cargo-preview.constant.js'

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
  void attachments
  return { code: 'ATTACHMENT_MISSING', kind: 'rejected' }
}
