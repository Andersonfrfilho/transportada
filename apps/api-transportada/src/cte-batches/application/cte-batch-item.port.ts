/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Item sem tentativa de emissão ainda não tem status fiscal próprio. */
export const CTE_BATCH_ITEM_PENDING_STATUS = 'pending'

/** Mesma regra da elegibilidade de faturamento: existir item de fatura tira o CT-e da fila. */
export const CTE_BATCH_ITEM_BILLING_STATUSES = ['invoiced', 'pending'] as const

export type CteBatchItemBillingStatus = (typeof CTE_BATCH_ITEM_BILLING_STATUSES)[number]

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
  readonly billingStatus: CteBatchItemBillingStatus
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

/** Linha da listagem que atravessa lotes: o lote deixa de ser contexto e passa a ser coluna. */
export type CompanyCteItem = CteBatchItem & {
  readonly batchId: string
  readonly batchName: string
  readonly createdAt: string
}

export type CompanyCteItemFilters = {
  readonly batchId?: string
  readonly billingStatusIn?: readonly string[]
  readonly cteNumberGte?: string
  readonly cteNumberIn?: readonly string[]
  readonly cteNumberLte?: string
  readonly invoiceNumberGte?: string
  readonly invoiceNumberIn?: readonly string[]
  readonly invoiceNumberLte?: string
  readonly issuedFrom?: string
  readonly issuedUntil?: string
  readonly statusIn?: readonly string[]
}

export type CompanyCteItemQuery = {
  readonly companyId: string
  readonly cursor: string | null
  readonly filters?: CompanyCteItemFilters
  readonly limit: number
}

export type CompanyCteItemPage = {
  readonly items: readonly CompanyCteItem[]
  readonly nextCursor: string | null
}

export type CteBatchItemReaderPort = {
  findBatch(query: CteBatchItemQuery): Promise<{ readonly id: string } | null>
  listCompanyItems(query: CompanyCteItemQuery): Promise<CompanyCteItemPage>
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

export type ListCompanyCteItemsInput = {
  readonly context: {
    readonly companyId: string
  }
  readonly cursor: string | null
  readonly filters?: CompanyCteItemFilters
  readonly limit: number
}
