/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type CteFiscalDocumentState = {
  readonly cancellationRequestedAt: Date | null
  readonly status: string
}

export type CteFiscalDocumentStatus = 'authorized' | 'cancelled'

/**
 * O documento fiscal, e não a tentativa, é a fonte da verdade sobre cancelamento — a tentativa
 * autorizada continua autorizada mesmo depois do evento 110111.
 */
export function resolveIssuedDocumentStatus(
  document: CteFiscalDocumentState,
): CteFiscalDocumentStatus {
  if (document.status === 'cancelled') return 'cancelled'
  return document.cancellationRequestedAt === null ? 'authorized' : 'cancelled'
}
