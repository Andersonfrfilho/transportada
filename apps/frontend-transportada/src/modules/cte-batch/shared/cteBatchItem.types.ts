/* Copyright (c) 2026 Ada Technology. MIT License. */
export const CTE_BATCH_ITEM_STATUS = {
  AUTHORIZED: 'authorized',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  IN_FLIGHT: 'in_flight',
  PENDING: 'pending',
  REJECTED: 'rejected',
  RETRY_SCHEDULED: 'retry_scheduled',
} as const

export type CteBatchItemCharge = Readonly<{
  amount: string
  baseAmount: string
  calculationType: string
  label: string
  ordinal: string
  rate: null | string
}>

export type CteBatchItemDocument = Readonly<{
  accessKey: string
  id: string
  number: string
  position: string
  series: string
  totalAmount: null | string
}>

/** Numeração que a emissão trocou sozinha depois de a SEFAZ acusar duplicidade do número. */
export type CteFiscalNumberChange = Readonly<{
  previousNumber: string
  reason: 'sefaz_duplicate_number'
  rejectionCode: string
}>

/** Espelha `CteBatchItem` da API — status é string aberta porque a SEFAZ acrescenta estados. */
export type CteBatchItem = Readonly<{
  accessKey: null | string
  authorizationProtocol: null | string
  authorizedAt: null | string
  baseAmount: string
  billingInvoiceNumber: null | string
  billingInvoicedAt: null | string
  billingStatus: string
  charges: readonly CteBatchItemCharge[]
  documents: readonly CteBatchItemDocument[]
  fiscalAmount: string
  fiscalDocumentId: null | string
  fiscalNumber: null | string
  fiscalNumberChange: CteFiscalNumberChange | null
  fiscalSeries: null | string
  id: string
  lastErrorCode: null | string
  position: string
  status: string
  totalAmount: string
}>

/** Linha da listagem que atravessa lotes: o lote deixa de ser contexto e passa a ser coluna. */
export type CompanyCteItem = CteBatchItem &
  Readonly<{
    batchId: string
    batchName: string
    createdAt: string
  }>

export type CompanyCteItemPage = Readonly<{
  items: readonly CompanyCteItem[]
  nextCursor: null | string
}>

/**
 * O recorte inteiro do filtro, somado no banco: a página mostra 25 linhas e nada diz sobre as
 * outras 142. `batchIds` é o que permite agir sobre o recorte — transmitir vai por lote.
 */
export type CompanyCteItemSummary = Readonly<{
  baseAmount: string
  batchIds: readonly string[]
  batchIdsTruncated: boolean
  count: number
  statusCounts: Readonly<Record<string, number>>
  totalAmount: string
}>

export type CteBatchItemDocumentLabel = Readonly<{
  accessKey: string
  id: string
  label: string
}>

export type CteBatchItemsSummary = Readonly<{
  authorizedCount: number
  documentCount: number
  pendingCount: number
  rejectedCount: number
  totalAmount: string
}>
