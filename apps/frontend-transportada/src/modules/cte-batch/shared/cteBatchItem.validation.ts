/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CompanyCteItem,
  CompanyCteItemPage,
  CteBatchItem,
  CteBatchItemCharge,
  CteBatchItemDocument,
  CteFiscalNumberChange,
} from './cteBatchItem.types'

const INVALID_ITEMS = 'CTE_BATCH_INVALID_ITEMS_RESPONSE'

const ITEM_KEYS = [
  'accessKey',
  'authorizationProtocol',
  'authorizedAt',
  'baseAmount',
  'billingStatus',
  'charges',
  'documents',
  'fiscalAmount',
  'fiscalDocumentId',
  'fiscalNumber',
  'fiscalNumberChange',
  'fiscalSeries',
  'id',
  'lastErrorCode',
  'position',
  'status',
  'totalAmount',
] as const

const FISCAL_NUMBER_CHANGE_KEYS = ['previousNumber', 'reason', 'rejectionCode'] as const

const DUPLICATE_NUMBER_REASON = 'sefaz_duplicate_number'

const CHARGE_KEYS = ['amount', 'baseAmount', 'calculationType', 'label', 'ordinal', 'rate'] as const

const DOCUMENT_KEYS = ['accessKey', 'id', 'number', 'position', 'series', 'totalAmount'] as const

const COMPANY_ITEM_KEYS = [...ITEM_KEYS, 'batchId', 'batchName', 'createdAt'] as const

const PAGE_KEYS = ['data', 'page'] as const

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

/** Motivo desconhecido é resposta que não sabemos explicar ao usuário: melhor recusar. */
function fiscalNumberChangeFromApi(input: unknown): CteFiscalNumberChange | null {
  if (input === null) return null
  if (!isRecord(input)) throw validationError()
  rejectExtraKeys(input, FISCAL_NUMBER_CHANGE_KEYS)
  if (
    !isString(input.previousNumber) ||
    !isString(input.rejectionCode) ||
    input.reason !== DUPLICATE_NUMBER_REASON
  ) {
    throw validationError()
  }
  return {
    previousNumber: input.previousNumber,
    reason: DUPLICATE_NUMBER_REASON,
    rejectionCode: input.rejectionCode,
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
    !isString(input.billingStatus) ||
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
    billingStatus: input.billingStatus,
    charges: input.charges.map(chargeFromApi),
    documents: input.documents.map(documentFromApi),
    fiscalAmount: input.fiscalAmount,
    fiscalDocumentId: input.fiscalDocumentId,
    fiscalNumber: input.fiscalNumber,
    fiscalNumberChange: fiscalNumberChangeFromApi(input.fiscalNumberChange),
    fiscalSeries: input.fiscalSeries,
    id: input.id,
    lastErrorCode: input.lastErrorCode,
    position: input.position,
    status: input.status,
    totalAmount: input.totalAmount,
  }
}

function companyItemFromApi(input: unknown): CompanyCteItem {
  if (!isRecord(input)) throw validationError()
  rejectExtraKeys(input, COMPANY_ITEM_KEYS)
  if (!isString(input.batchId) || !isString(input.batchName) || !isString(input.createdAt)) {
    throw validationError()
  }
  return {
    ...itemFromApi(onlyBatchItemKeys(input)),
    batchId: input.batchId,
    batchName: input.batchName,
    createdAt: input.createdAt,
  }
}

/** As colunas do lote entram por fora porque `itemFromApi` rejeita qualquer chave além das dele. */
function onlyBatchItemKeys(input: Record<string, unknown>): Record<string, unknown> {
  const allowedKeys: readonly string[] = ITEM_KEYS
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowedKeys.includes(key)))
}

function nextCursorFromApi(input: unknown): null | string {
  if (!isRecord(input)) throw validationError()
  rejectExtraKeys(input, ['nextCursor'])
  if (!isNullableString(input.nextCursor)) throw validationError()
  return input.nextCursor
}

export function createCteBatchItemsAdapter(): (input: unknown) => readonly CteBatchItem[] {
  return (input) => {
    if (!isRecord(input) || !Array.isArray(input.data)) throw validationError()
    rejectExtraKeys(input, ['data'])
    return input.data.map(itemFromApi)
  }
}

export function createCompanyCteItemPageAdapter(): (input: unknown) => CompanyCteItemPage {
  return (input) => {
    if (!isRecord(input) || !Array.isArray(input.data)) throw validationError()
    rejectExtraKeys(input, PAGE_KEYS)
    return {
      items: input.data.map(companyItemFromApi),
      nextCursor: nextCursorFromApi(input.page),
    }
  }
}
