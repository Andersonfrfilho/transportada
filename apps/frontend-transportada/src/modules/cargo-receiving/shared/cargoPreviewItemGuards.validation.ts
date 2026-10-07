/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { CARGO_PREVIEW_DECIDERS, CARGO_PREVIEW_ITEM_STATES } from './cargoPreview.constant'
import type {
  CargoPreviewDetail,
  CargoPreviewItem,
  CargoPreviewLinkedDocument,
  CargoPreviewRowError,
} from './cargoPreview.types'
import {
  isNullableString,
  isOneOf,
  isPreviewSummary,
  isRouteGroup,
  isStateCounts,
  isStringList,
  PREVIEW_SUMMARY_KEYS,
} from './cargoPreviewGuards.validation'

const LINKED_DOCUMENT_KEYS = [
  'id',
  'importedAt',
  'issuedAt',
  'number',
  'recipientName',
  'series',
  'totalValue',
] as const
const ITEM_KEYS = [
  'address',
  'candidateDocumentIds',
  'city',
  'contractorReference',
  'document',
  'evidence',
  'id',
  'matchGroupKey',
  'matchState',
  'matchedAt',
  'matchedBy',
  'neighborhood',
  'postalCode',
  'recipientCode',
  'recipientName',
  'routeName',
  'routingDate',
  'rowErrors',
  'rowNumber',
  'state',
  'value',
  'volumeM3',
  'weightKg',
] as const
const NULLABLE_TEXT_KEYS = [
  'address',
  'city',
  'contractorReference',
  'matchGroupKey',
  'matchedAt',
  'neighborhood',
  'postalCode',
  'recipientCode',
  'recipientName',
  'routeName',
  'routingDate',
  'state',
  'value',
  'volumeM3',
  'weightKg',
] as const

function isLinkedDocument(value: unknown): value is CargoPreviewLinkedDocument {
  return (
    hasExactKeys(value, LINKED_DOCUMENT_KEYS) &&
    isNullableString(value.recipientName) &&
    ['id', 'importedAt', 'issuedAt', 'number', 'series', 'totalValue'].every(
      (key) => typeof value[key as 'id'] === 'string',
    )
  )
}

/**
 * O erro de linha mora num `jsonb` que o leitor da planilha escreve, sem tipo no banco: aqui basta que
 * tenha as três chaves de texto que a tela mostra; qualquer outra é ignorada.
 */
function isRowError(value: unknown): value is CargoPreviewRowError {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record: Record<string, unknown> = { ...value }
  return ['column', 'field', 'message'].every((key) => typeof record[key] === 'string')
}

function isItem(value: unknown): value is CargoPreviewItem {
  if (!hasExactKeys(value, ITEM_KEYS)) return false
  return (
    isOneOf(value.matchState, CARGO_PREVIEW_ITEM_STATES) &&
    (value.matchedBy === null || isOneOf(value.matchedBy, CARGO_PREVIEW_DECIDERS)) &&
    (value.document === null || isLinkedDocument(value.document)) &&
    isStringList(value.candidateDocumentIds) &&
    isStringList(value.evidence) &&
    Array.isArray(value.rowErrors) &&
    value.rowErrors.every(isRowError) &&
    NULLABLE_TEXT_KEYS.every((key) => isNullableString(value[key])) &&
    typeof value.id === 'string' &&
    Number.isInteger(value.rowNumber)
  )
}

function isItemPage(value: unknown): value is CargoPreviewDetail['items'] {
  return (
    hasExactKeys(value, ['items', 'nextCursor']) &&
    isNullableString(value.nextCursor) &&
    Array.isArray(value.items) &&
    value.items.every(isItem)
  )
}

export function isPreviewDetail(value: unknown): value is CargoPreviewDetail {
  if (!hasExactKeys(value, [...PREVIEW_SUMMARY_KEYS, 'counts', 'items', 'routes'])) return false
  const { counts, items, routes, ...summary } = value
  return (
    isPreviewSummary(summary) &&
    isStateCounts(counts) &&
    isItemPage(items) &&
    Array.isArray(routes) &&
    routes.every(isRouteGroup)
  )
}
