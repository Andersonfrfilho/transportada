/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  TRIP_TIMELINE_DOCUMENT_RELEASE_KEYS,
  TRIP_TIMELINE_DOCUMENTS_ADDED_KEYS,
} from './trip.constant'
import {
  hasExactKeys,
  isBoolean,
  isNullableString,
  isString,
  isUnsignedInteger,
} from './tripGuards.validation'

function isDocumentsAdded(value: unknown): boolean {
  return (
    hasExactKeys(value, TRIP_TIMELINE_DOCUMENTS_ADDED_KEYS) &&
    isUnsignedInteger(value.documentCount) &&
    isUnsignedInteger(value.documentsWithoutCte) &&
    isBoolean(value.mdfeDocumentDivergence) &&
    isString(value.reason)
  )
}

/** Spec 257 D9: o `documentsAdded` é do item do acréscimo e de mais nenhum; nele, é obrigatório. */
export function hasDocumentsAddedForKind(value: Readonly<Record<string, unknown>>): boolean {
  if (value.kind !== 'documents_added') return value.documentsAdded === undefined
  return isDocumentsAdded(value.documentsAdded)
}

function isDocumentRelease(value: unknown): boolean {
  return (
    hasExactKeys(value, TRIP_TIMELINE_DOCUMENT_RELEASE_KEYS) &&
    isNullableString(value.note) &&
    (value.scope === 'document' || value.scope === 'stop') &&
    isNullableString(value.stopLabel)
  )
}

/** A chave `documentRelease` é do item da retirada e de mais nenhum; nele, é obrigatória. */
export function hasDocumentReleaseForKind(value: Readonly<Record<string, unknown>>): boolean {
  if (value.kind !== 'document.released') return value.documentRelease === undefined
  return isDocumentRelease(value.documentRelease)
}
