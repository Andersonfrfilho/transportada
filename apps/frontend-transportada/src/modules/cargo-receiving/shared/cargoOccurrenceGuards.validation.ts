/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys, hasKeys } from '@/modules/shared/objectKeys.service'

import {
  CARGO_OCCURRENCE_CASE_STATUSES,
  CARGO_OCCURRENCE_ITEMS_MODES,
  CARGO_RETURN_STATES,
} from './cargoOccurrence.constant'
import type {
  CargoDocumentProduct,
  CargoDocumentReturn,
  CargoOccurrenceAttachment,
  CargoOccurrenceItem,
  CargoOccurrenceView,
  CargoOccurrencesView,
  CargoReturnResult,
  ReceivingOccurrenceType,
} from './cargoOccurrence.types'

/**
 * Resposta de API é entrada não confiável (`security.md` §3): as chaves são conferidas EXATAS, em cada nível,
 * no formato real de `cargo-arrival-occurrence.types.ts`. A única exceção é o anexo, que a API monta com três
 * chaves opcionais (`downloadUrl`, `expiresAt`, `thumbnailUrl` somem quando vencido ou sem miniatura): ali o
 * conjunto PERMITIDO é fechado e o OBRIGATÓRIO é o mínimo.
 */
const TYPE_KEYS = ['allowsMultipleItems', 'id', 'itemsMode', 'name'] as const
const PRODUCT_KEYS = [
  'code',
  'commercialUnit',
  'description',
  'ordinal',
  'quantity',
  'totalValue',
  'unitValue',
] as const
const ATTACHMENT_REQUIRED = ['expired', 'id', 'mimeType', 'position'] as const
const ATTACHMENT_ALLOWED = [
  ...ATTACHMENT_REQUIRED,
  'downloadUrl',
  'expiresAt',
  'thumbnailUrl',
] as const
const ITEM_KEYS = ['code', 'description', 'quantity', 'unit'] as const
const CASE_KEYS = ['id', 'status'] as const
const OCCURRENCE_KEYS = [
  'actorName',
  'attachments',
  'cancelledAt',
  'case',
  'channel',
  'createdAt',
  'id',
  'items',
  'nfeDocumentId',
  'note',
  'occurrenceTypeId',
  'typeName',
] as const
const DOCUMENT_RETURN_KEYS = ['nfeDocumentId', 'returnOccurrenceId', 'returnToContractor'] as const
const VIEW_KEYS = ['documents', 'occurrences', 'returnCounts'] as const
const RETURN_COUNT_KEYS = ['marked', 'returned'] as const
const RETURN_RESULT_KEYS = [
  'documentId',
  'outcome',
  'returnOccurrenceId',
  'returnToContractor',
] as const

function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return typeof value === 'string' && options.includes(value as TOption)
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value)

export function isReceivingType(value: unknown): value is ReceivingOccurrenceType {
  return (
    hasExactKeys(value, TYPE_KEYS) &&
    typeof value.allowsMultipleItems === 'boolean' &&
    isOneOf(value.itemsMode, CARGO_OCCURRENCE_ITEMS_MODES) &&
    isString(value.id) &&
    isString(value.name)
  )
}

export function isDocumentProduct(value: unknown): value is CargoDocumentProduct {
  return (
    hasExactKeys(value, PRODUCT_KEYS) &&
    Number.isInteger(value.ordinal) &&
    PRODUCT_KEYS.filter((key) => key !== 'ordinal').every((key) => isString(value[key]))
  )
}

function isAttachment(value: unknown): value is CargoOccurrenceAttachment {
  if (!hasKeys(value, { allowed: ATTACHMENT_ALLOWED, required: ATTACHMENT_REQUIRED })) return false
  return (
    typeof value.expired === 'boolean' &&
    Number.isInteger(value.position) &&
    isString(value.id) &&
    isString(value.mimeType) &&
    ['downloadUrl', 'expiresAt', 'thumbnailUrl'].every(
      (key) => value[key] === undefined || isString(value[key]),
    )
  )
}

function isItem(value: unknown): value is CargoOccurrenceItem {
  return (
    hasExactKeys(value, ITEM_KEYS) &&
    isString(value.code) &&
    isString(value.description) &&
    isNullableString(value.quantity) &&
    isNullableString(value.unit)
  )
}

function isCase(value: unknown): boolean {
  return (
    value === null ||
    (hasExactKeys(value, CASE_KEYS) &&
      isString(value.id) &&
      isOneOf(value.status, CARGO_OCCURRENCE_CASE_STATUSES))
  )
}

export function isOccurrence(value: unknown): value is CargoOccurrenceView {
  if (!hasExactKeys(value, OCCURRENCE_KEYS)) return false
  return (
    isCase(value.case) &&
    isNullableString(value.actorName) &&
    isNullableString(value.cancelledAt) &&
    Array.isArray(value.attachments) &&
    value.attachments.every(isAttachment) &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    ['channel', 'createdAt', 'id', 'nfeDocumentId', 'note', 'occurrenceTypeId', 'typeName'].every(
      (key) => isString(value[key]),
    )
  )
}

function isDocumentReturn(value: unknown): value is CargoDocumentReturn {
  return (
    hasExactKeys(value, DOCUMENT_RETURN_KEYS) &&
    isString(value.nfeDocumentId) &&
    isNullableString(value.returnOccurrenceId) &&
    isOneOf(value.returnToContractor, CARGO_RETURN_STATES)
  )
}

export function isOccurrencesView(value: unknown): value is CargoOccurrencesView {
  return (
    hasExactKeys(value, VIEW_KEYS) &&
    Array.isArray(value.documents) &&
    value.documents.every(isDocumentReturn) &&
    Array.isArray(value.occurrences) &&
    value.occurrences.every(isOccurrence) &&
    hasExactKeys(value.returnCounts, RETURN_COUNT_KEYS) &&
    Number.isInteger(value.returnCounts.marked) &&
    Number.isInteger(value.returnCounts.returned)
  )
}

export function isReturnResult(value: unknown): value is CargoReturnResult {
  return (
    hasExactKeys(value, RETURN_RESULT_KEYS) &&
    isString(value.documentId) &&
    (value.outcome === 'changed' || value.outcome === 'unchanged') &&
    isNullableString(value.returnOccurrenceId) &&
    isOneOf(value.returnToContractor, CARGO_RETURN_STATES)
  )
}
