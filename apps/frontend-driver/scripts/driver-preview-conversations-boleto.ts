/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Boleto da demonstração do motorista (spec 248 T5.4): o PDF que o escritório leva da contratante à conversa da
 * ocorrência. Sintético e mínimo, sem dado real; a URL do anexo o serve com `Content-Disposition: attachment`.
 */
import type { PreviewAttachment } from './driver-preview-conversations.types'

export const PDF_CONTENT_TYPE = 'application/pdf'

export const PREVIEW_BOLETO_FILE_NAME = 'boleto.pdf'

const BOLETO_PDF_TEXT = [
  '%PDF-1.4',
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >> endobj',
  'trailer << /Root 1 0 R /Size 4 >>',
  '%%EOF',
].join('\n')

export const BOLETO_PDF: Uint8Array<ArrayBuffer> = new TextEncoder().encode(BOLETO_PDF_TEXT)

export const PREVIEW_BOLETO_ATTACHMENT: PreviewAttachment = {
  contentType: PDF_CONTENT_TYPE,
  fileName: PREVIEW_BOLETO_FILE_NAME,
  id: '00000000-0000-4000-8000-0000000002b1',
  sizeBytes: BOLETO_PDF.byteLength,
}
