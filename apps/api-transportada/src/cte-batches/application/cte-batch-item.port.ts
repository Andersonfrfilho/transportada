/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Item sem tentativa de emissão ainda não tem status fiscal próprio. */
export const CTE_BATCH_ITEM_PENDING_STATUS = 'pending'

export type CteBatchItemCharge = {
  readonly amount: string
  readonly baseAmount: string
  readonly calculationType: string
  readonly label: string
  readonly ordinal: string
  readonly rate: string | null
}

export type CteBatchItemDocument = {
  readonly accessKey: string
  readonly id: string
  readonly number: string
  readonly position: string
  readonly series: string
  readonly totalAmount: string | null
}

export type CteBatchItem = {
  readonly accessKey: string | null
  readonly authorizationProtocol: string | null
  readonly authorizedAt: string | null
  readonly baseAmount: string
  readonly charges: readonly CteBatchItemCharge[]
  readonly documents: readonly CteBatchItemDocument[]
  readonly fiscalAmount: string
  readonly fiscalDocumentId: string | null
  readonly fiscalNumber: string | null
  readonly fiscalSeries: string | null
  readonly id: string
  readonly lastErrorCode: string | null
  readonly position: string
  readonly status: string
  readonly totalAmount: string
}

export type CteBatchItemQuery = {
  readonly batchId: string
  readonly companyId: string
}

export type CteBatchItemReaderPort = {
  findBatch(query: CteBatchItemQuery): Promise<{ readonly id: string } | null>
  listItems(query: CteBatchItemQuery): Promise<readonly CteBatchItem[]>
}

export type ListCteBatchItemsInput = {
  readonly batchId: string
  readonly context: {
    readonly companyId: string
  }
}

export type ListCteBatchItemsResult = {
  readonly items: readonly CteBatchItem[]
}
