/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  TRIP_TIMELINE_DOCUMENT_RELEASE_KEYS,
  TRIP_TIMELINE_DOCUMENT_RELEASE_SCOPES,
} from './trip.constant'
import { hasExactKeys, isNullableString, isOneOf } from './tripGuards.validation'

function isDocumentRelease(value: unknown): boolean {
  return (
    hasExactKeys(value, TRIP_TIMELINE_DOCUMENT_RELEASE_KEYS) &&
    isNullableString(value.note) &&
    isOneOf(value.scope, TRIP_TIMELINE_DOCUMENT_RELEASE_SCOPES) &&
    isNullableString(value.stopLabel)
  )
}

/** O `documentRelease` é do item da retirada e de mais nenhum; nele, é obrigatório. */
export function hasDocumentReleaseForKind(value: Readonly<Record<string, unknown>>): boolean {
  if (value.kind !== 'document.released') return value.documentRelease === undefined
  return isDocumentRelease(value.documentRelease)
}
