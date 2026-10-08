/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DocumentLinkAfterDispatch,
  LinkDocumentsAfterDispatchInput,
} from './tripDocumentLink.types'

export const DOCUMENT_LINK_REASON_MAX_LENGTH = 500
export const DOCUMENT_LINK_MAX_DOCUMENTS = 300

export type DocumentLinkBlocker =
  | 'noDocuments'
  | 'reasonRequired'
  | 'reasonTooLong'
  | 'tooManyDocuments'

export type DocumentLinkDraft = Readonly<{
  nfeDocumentIds: readonly string[]
  reason: string
}>

export function resolveDocumentLinkBlocker(
  input: DocumentLinkDraft,
): DocumentLinkBlocker | undefined {
  if (input.nfeDocumentIds.length === 0) return 'noDocuments'
  if (input.nfeDocumentIds.length > DOCUMENT_LINK_MAX_DOCUMENTS) return 'tooManyDocuments'
  const reasonLength = input.reason.trim().length
  if (reasonLength === 0) return 'reasonRequired'
  if (reasonLength > DOCUMENT_LINK_REASON_MAX_LENGTH) return 'reasonTooLong'
  return undefined
}

export function buildLinkDocumentsAfterDispatchInput(
  input: LinkDocumentsAfterDispatchInput,
): LinkDocumentsAfterDispatchInput {
  return {
    nfeDocumentIds: input.nfeDocumentIds,
    reason: input.reason.trim(),
    tripId: input.tripId,
  }
}

export const DOCUMENT_LINK_ERROR_KEYS = ['notAllowed', 'generic'] as const
export type DocumentLinkErrorKey = (typeof DOCUMENT_LINK_ERROR_KEYS)[number]

const DOCUMENT_LINK_ERROR_KEY_BY_CODE: Readonly<Record<string, DocumentLinkErrorKey>> = {
  STATE_TRANSITION_NOT_ALLOWED: 'notAllowed',
}

/** O `code` do erro viaja em `error.message` (`tripClient.service.ts`) — nunca o texto de `details`. */
export function resolveDocumentLinkErrorKey(error: unknown): DocumentLinkErrorKey {
  if (!(error instanceof Error)) return 'generic'
  return DOCUMENT_LINK_ERROR_KEY_BY_CODE[error.message] ?? 'generic'
}

export type DocumentLinkOutcome = Readonly<{
  hasMdfeDivergence: boolean
  hasNothingLinked: boolean
  linkedCount: number
  skippedCount: number
  withoutCteCount: number
}>

/** Spec 257 D6/D7: quantas entraram, quantas já estavam em viagem viva e os dois avisos fiscais. */
export function resolveDocumentLinkOutcome(link: DocumentLinkAfterDispatch): DocumentLinkOutcome {
  return {
    hasMdfeDivergence: link.mdfeDocumentDivergence,
    hasNothingLinked: link.linked.length === 0,
    linkedCount: link.linked.length,
    skippedCount: link.skipped.length,
    withoutCteCount: link.documentsWithoutCte,
  }
}
