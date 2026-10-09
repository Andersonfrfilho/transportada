/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_ERROR } from './trip.constant'
import type {
  DocumentLinkAfterDispatch,
  DocumentLinkLinked,
  DocumentLinkSkipped,
} from './tripDocumentLink.types'
import {
  hasExactKeys,
  isBoolean,
  isEveryItem,
  isNullableString,
  isString,
  isUnsignedInteger,
} from './tripGuards.validation'

const DOCUMENT_LINK_KEYS = [
  'createdStopIds',
  'documentsWithoutCte',
  'eventId',
  'linked',
  'mdfeDocumentDivergence',
  'skipped',
] as const
const LINKED_KEYS = ['nfeDocumentId', 'stopId', 'tripDocumentId'] as const
const SKIPPED_KEYS = ['nfeDocumentId', 'reason'] as const

function isLinked(value: unknown): value is DocumentLinkLinked {
  return (
    hasExactKeys(value, LINKED_KEYS) &&
    isString(value.nfeDocumentId) &&
    isNullableString(value.stopId) &&
    isString(value.tripDocumentId)
  )
}

function isSkipped(value: unknown): value is DocumentLinkSkipped {
  return (
    hasExactKeys(value, SKIPPED_KEYS) &&
    isString(value.nfeDocumentId) &&
    value.reason === 'already_linked'
  )
}

/** Chave exata: campo a mais ou contagem fora do tipo é resposta trocada, e o aviso fiscal não pode mentir. */
export function parseDocumentLinkAfterDispatch(value: unknown): DocumentLinkAfterDispatch {
  if (
    !hasExactKeys(value, DOCUMENT_LINK_KEYS) ||
    !isEveryItem(value.createdStopIds, isString) ||
    !isUnsignedInteger(value.documentsWithoutCte) ||
    !isNullableString(value.eventId) ||
    !isEveryItem(value.linked, isLinked) ||
    !isBoolean(value.mdfeDocumentDivergence) ||
    !isEveryItem(value.skipped, isSkipped)
  ) {
    throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  }
  return {
    createdStopIds: value.createdStopIds,
    documentsWithoutCte: value.documentsWithoutCte,
    eventId: value.eventId,
    linked: value.linked,
    mdfeDocumentDivergence: value.mdfeDocumentDivergence,
    skipped: value.skipped,
  }
}
