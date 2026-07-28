/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteBatchItem, CteBatchItemCharge, CteBatchItemDocument } from './cteBatchItem.types'

const INVALID_ITEMS = 'CTE_BATCH_INVALID_ITEMS_RESPONSE'

const ITEM_KEYS = [
  'accessKey',
  'authorizationProtocol',
  'authorizedAt',
  'baseAmount',
  'charges',
  'documents',
  'fiscalAmount',
  'fiscalDocumentId',
  'fiscalNumber',
  'fiscalSeries',
  'id',
  'lastErrorCode',
  'position',
  'status',
  'totalAmount',
] as const

const CHARGE_KEYS = ['amount', 'baseAmount', 'calculationType', 'label', 'ordinal', 'rate'] as const

const DOCUMENT_KEYS = ['accessKey', 'id', 'number', 'position', 'series', 'totalAmount'] as const

function validationError(): Error {
  return new Error(INVALID_ITEMS)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function rejectExtraKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) throw validationError()
}

function chargeFromApi(input: unknown): CteBatchItemCharge {
  if (!isRecord(input)) throw validationError()
  rejectExtraKeys(input, CHARGE_KEYS)
  if (
    !isString(input.amount) ||
    !isString(input.baseAmount) ||
    !isString(input.calculationType) ||
    !isString(input.label) ||
    !isString(input.ordinal) ||
    !isNullableString(input.rate)
  ) {
    throw validationError()
  }
  return {
    amount: input.amount,
    baseAmount: input.baseAmount,
    calculationType: input.calculationType,
    label: input.label,
    ordinal: input.ordinal,
    rate: input.rate,
  }
}

function documentFromApi(input: unknown): CteBatchItemDocument {
  if (!isRecord(input)) throw validationError()
  rejectExtraKeys(input, DOCUMENT_KEYS)
  if (
    !isString(input.accessKey) ||
    !isString(input.id) ||
    !isString(input.number) ||
    !isString(input.position) ||
    !isString(input.series) ||
    !isNullableString(input.totalAmount)
  ) {
    throw validationError()
  }
  return {
    accessKey: input.accessKey,
    id: input.id,
    number: input.number,
    position: input.position,
    series: input.series,
    totalAmount: input.totalAmount,
  }
}

function itemFromApi(input: unknown): CteBatchItem {
  if (!isRecord(input)) throw validationError()
  rejectExtraKeys(input, ITEM_KEYS)
  if (
    !isNullableString(input.accessKey) ||
    !isNullableString(input.authorizationProtocol) ||
    !isNullableString(input.authorizedAt) ||
    !isString(input.baseAmount) ||
    !Array.isArray(input.charges) ||
    !Array.isArray(input.documents) ||
    !isString(input.fiscalAmount) ||
    !isNullableString(input.fiscalDocumentId) ||
    !isNullableString(input.fiscalNumber) ||
    !isNullableString(input.fiscalSeries) ||
    !isString(input.id) ||
    !isNullableString(input.lastErrorCode) ||
    !isString(input.position) ||
    !isString(input.status) ||
    !isString(input.totalAmount)
  ) {
    throw validationError()
  }
  return {
    accessKey: input.accessKey,
    authorizationProtocol: input.authorizationProtocol,
    authorizedAt: input.authorizedAt,
    baseAmount: input.baseAmount,
    charges: input.charges.map(chargeFromApi),
    documents: input.documents.map(documentFromApi),
    fiscalAmount: input.fiscalAmount,
    fiscalDocumentId: input.fiscalDocumentId,
    fiscalNumber: input.fiscalNumber,
    fiscalSeries: input.fiscalSeries,
    id: input.id,
    lastErrorCode: input.lastErrorCode,
    position: input.position,
    status: input.status,
    totalAmount: input.totalAmount,
  }
}

export function createCteBatchItemsAdapter(): (input: unknown) => readonly CteBatchItem[] {
  return (input) => {
    if (!isRecord(input) || !Array.isArray(input.data)) throw validationError()
    rejectExtraKeys(input, ['data'])
    return input.data.map(itemFromApi)
  }
}
