/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Só o texto cru — a extração de campo por campo é responsabilidade nossa (ver `aggregate-document-ocr.policy.ts`). */
export type AggregateDocumentOcrPort = Readonly<{
  extractText: (input: { readonly bytes: Uint8Array; readonly mimeType: string }) => Promise<string>
}>
