/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteBatchStatus, CteBatchSummary } from './cteBatchClient.service'
import {
  CTE_BATCH_ITEM_STATUS,
  type CompanyCteItem,
  type CteBatchItem,
  type CteBatchItemDocumentLabel,
  type CteBatchItemsSummary,
} from './cteBatchItem.types'

export const CTE_MANAGE_PERMISSION = 'cte.manage'
export const CTE_SUBMIT_PERMISSION = 'cte.submit'
/** Cancelar na SEFAZ é irreversível — quem transmite não herda o poder de cancelar. */
export const CTE_CANCEL_PERMISSION = 'cte.cancel'

export const CTE_CANCELLATION_JUSTIFICATION_ERROR = {
  REQUIRED: 'required',
  TOO_LONG: 'tooLong',
  TOO_SHORT: 'tooShort',
} as const
export type CteCancellationJustificationError =
  (typeof CTE_CANCELLATION_JUSTIFICATION_ERROR)[keyof typeof CTE_CANCELLATION_JUSTIFICATION_ERROR]

/** Limites da tag xJust do evento 110111, espelhados da rota de cancelamento. */
const JUSTIFICATION_MIN_LENGTH = 15
const JUSTIFICATION_MAX_LENGTH = 255

/**
 * Fechar o rascunho virou efeito da emissão, no backend: transmitir é o passo único do operador.
 * Submetido e em voo já são consequência do comando — repetir reservaria outro número fiscal.
 */
const TRANSMITTABLE_STATUSES: readonly CteBatchStatus[] = ['draft', 'error']
const CANCELLABLE_STATUSES: readonly CteBatchStatus[] = ['draft', 'submitted']
const REMOVABLE_ITEM_BATCH_STATUSES: readonly CteBatchStatus[] = ['draft']
const REPROCESSABLE_ITEM_STATUSES: readonly string[] = [
  CTE_BATCH_ITEM_STATUS.FAILED,
  CTE_BATCH_ITEM_STATUS.REJECTED,
  CTE_BATCH_ITEM_STATUS.RETRY_SCHEDULED,
]
const PENDING_ITEM_STATUSES: readonly string[] = [
  CTE_BATCH_ITEM_STATUS.IN_FLIGHT,
  CTE_BATCH_ITEM_STATUS.PENDING,
  CTE_BATCH_ITEM_STATUS.RETRY_SCHEDULED,
]
const REJECTED_ITEM_STATUSES: readonly string[] = [
  CTE_BATCH_ITEM_STATUS.FAILED,
  CTE_BATCH_ITEM_STATUS.REJECTED,
]

const FISCAL_SCALE = 2

type BatchActionInput = Readonly<{ batch: CteBatchSummary; permissions: readonly string[] }>
type ItemActionInput = Readonly<{ item: CteBatchItem; permissions: readonly string[] }>

function allows(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission)
}

export function canTransmitBatch(input: BatchActionInput): boolean {
  return (
    allows(input.permissions, CTE_SUBMIT_PERMISSION) &&
    TRANSMITTABLE_STATUSES.includes(input.batch.status)
  )
}

export type CteItemBatchGroup = Readonly<{ batchId: string; itemIds: readonly string[] }>

export function groupSelectionByBatch(
  input: Readonly<{
    items: readonly Pick<CompanyCteItem, 'batchId' | 'id'>[]
    selectedIds: readonly string[]
  }>,
): readonly CteItemBatchGroup[] {
  const selected = input.items.filter((item) => input.selectedIds.includes(item.id))
  const batchIds = [...new Set(selected.map((item) => item.batchId))]
  return batchIds.map((batchId) => ({
    batchId,
    itemIds: selected.filter((item) => item.batchId === batchId).map((item) => item.id),
  }))
}

export function canTransmitSelection(
  input: Readonly<{
    batchStatuses: ReadonlyMap<string, CteBatchStatus>
    groups: readonly CteItemBatchGroup[]
    permissions: readonly string[]
  }>,
): boolean {
  if (input.groups.length === 0) return false
  if (!allows(input.permissions, CTE_SUBMIT_PERMISSION)) return false
  return input.groups.every((group) => {
    const status = input.batchStatuses.get(group.batchId)
    return status !== undefined && TRANSMITTABLE_STATUSES.includes(status)
  })
}

export function canCancelBatch(input: BatchActionInput): boolean {
  return (
    allows(input.permissions, CTE_MANAGE_PERMISSION) &&
    CANCELLABLE_STATUSES.includes(input.batch.status)
  )
}

export function canRemoveItem(input: BatchActionInput): boolean {
  return (
    allows(input.permissions, CTE_MANAGE_PERMISSION) &&
    REMOVABLE_ITEM_BATCH_STATUSES.includes(input.batch.status)
  )
}

export function canCancelItem(input: ItemActionInput): boolean {
  return (
    allows(input.permissions, CTE_CANCEL_PERMISSION) &&
    input.item.status === CTE_BATCH_ITEM_STATUS.AUTHORIZED &&
    input.item.accessKey !== null &&
    input.item.authorizationProtocol !== null
  )
}

export function validateCancellationJustification(
  value: string,
): CteCancellationJustificationError | null {
  const justification = value.trim()
  if (justification.length === 0) return CTE_CANCELLATION_JUSTIFICATION_ERROR.REQUIRED
  if (justification.length < JUSTIFICATION_MIN_LENGTH) {
    return CTE_CANCELLATION_JUSTIFICATION_ERROR.TOO_SHORT
  }
  if (justification.length > JUSTIFICATION_MAX_LENGTH) {
    return CTE_CANCELLATION_JUSTIFICATION_ERROR.TOO_LONG
  }
  return null
}

export function canReprocessItem(input: ItemActionInput): boolean {
  return (
    allows(input.permissions, CTE_SUBMIT_PERMISSION) &&
    REPROCESSABLE_ITEM_STATUSES.includes(input.item.status)
  )
}

export function canDownloadItem(input: ItemActionInput): boolean {
  return (
    allows(input.permissions, CTE_SUBMIT_PERMISSION) &&
    input.item.status === CTE_BATCH_ITEM_STATUS.AUTHORIZED &&
    input.item.accessKey !== null
  )
}

export function describeItemDocuments(item: CteBatchItem): readonly CteBatchItemDocumentLabel[] {
  return item.documents.map((document) => ({
    accessKey: document.accessKey,
    id: document.id,
    label: `${document.series}/${document.number}`,
  }))
}

/** Dinheiro fiscal só soma em inteiro escalado — float binário jamais toca o valor do CT-e. */
function toScaledAmount(value: string): bigint {
  const [integerPart = '0', fractionPart = ''] = value.replace('-', '').split('.')
  const scaled = BigInt(
    `${integerPart}${fractionPart.padEnd(FISCAL_SCALE, '0').slice(0, FISCAL_SCALE)}`,
  )
  return value.startsWith('-') ? -scaled : scaled
}

function fromScaledAmount(value: bigint): string {
  const sign = value < 0n ? '-' : ''
  const digits = (value < 0n ? -value : value).toString().padStart(FISCAL_SCALE + 1, '0')
  return `${sign}${digits.slice(0, -FISCAL_SCALE)}.${digits.slice(-FISCAL_SCALE)}`
}

export function sumFiscalAmounts(values: readonly string[]): string {
  return fromScaledAmount(values.reduce((total, value) => total + toScaledAmount(value), 0n))
}

export function summarizeBatchItems(items: readonly CteBatchItem[]): CteBatchItemsSummary {
  return {
    authorizedCount: items.filter((item) => item.status === CTE_BATCH_ITEM_STATUS.AUTHORIZED)
      .length,
    documentCount: items.reduce((total, item) => total + item.documents.length, 0),
    pendingCount: items.filter((item) => PENDING_ITEM_STATUSES.includes(item.status)).length,
    rejectedCount: items.filter((item) => REJECTED_ITEM_STATUSES.includes(item.status)).length,
    totalAmount: sumFiscalAmounts(items.map((item) => item.fiscalAmount)),
  }
}
