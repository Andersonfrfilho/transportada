/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveNfseDocumentBytes } from '../domain/nfse-document-payload.policy.js'
import { readText } from './nota-rp-v3-envelope.js'
import type { NotaRpDocumentKind, NotaRpDocumentOutcome } from './nota-rp-v2.client.js'

export const DOCUMENT_MEDIA_TYPE: Readonly<Record<NotaRpDocumentKind, string>> = {
  pdf: 'application/pdf',
  xml: 'application/xml',
}

/** O documento vem em base64 dentro do envelope; a assinatura dos bytes ainda decide se é documento. */
export function readEnvelopedDocument(input: {
  readonly envelope: Readonly<Record<string, unknown>>
  readonly kind: NotaRpDocumentKind
}): NotaRpDocumentOutcome {
  const encoded = readText(input.envelope, 'base64_file')
  if (encoded === undefined) return { cause: 'malformed_response', status: 'error' }

  const decoded = new Uint8Array(Buffer.from(encoded, 'base64'))
  const bytes = resolveNfseDocumentBytes({ bytes: decoded, kind: input.kind })
  if (bytes === undefined) return { cause: 'malformed_response', status: 'error' }

  return { bytes, contentType: DOCUMENT_MEDIA_TYPE[input.kind], status: 'ok' }
}
