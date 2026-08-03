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

/** Espelha `CteBatchItem` da API — status é string aberta porque a SEFAZ acrescenta estados. */
export type CteBatchItem = Readonly<{
  accessKey: null | string
  authorizationProtocol: null | string
  authorizedAt: null | string
  baseAmount: string
  billingStatus: string
  charges: readonly CteBatchItemCharge[]
  documents: readonly CteBatchItemDocument[]
  fiscalAmount: string
  fiscalDocumentId: null | string
  fiscalNumber: null | string
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
