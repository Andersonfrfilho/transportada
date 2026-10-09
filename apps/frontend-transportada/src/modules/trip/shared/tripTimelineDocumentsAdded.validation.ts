/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_TIMELINE_DOCUMENTS_ADDED_KEYS } from './trip.constant'
import { hasExactKeys, isBoolean, isString, isUnsignedInteger } from './tripGuards.validation'

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
