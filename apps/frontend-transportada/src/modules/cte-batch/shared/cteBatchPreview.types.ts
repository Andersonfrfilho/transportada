/* Copyright (c) 2026 Ada Technology. MIT License. */
export type CteBatchGroupingMode = 'per_invoice' | 'sender_recipient'

export type CteBatchPreviewRequest = Readonly<{
  documentIds: readonly string[]
  emissionProfileId?: string
  groupingMode?: CteBatchGroupingMode
}>

export type CteBatchPreviewBlock = Readonly<{
  batchId: null | string
  documentId: string
  reason: string
}>

export type CteBatchPreviewDocument = Readonly<{
  accessKey: string
  documentId: string
  number: string
  series: string
  totalAmount: string
}>

export type CteBatchPreviewComponent = Readonly<{
  amount: string
  calculationType: string
  label: string
}>

export type CteBatchPreviewProfile = Readonly<{
  groupingMode: CteBatchGroupingMode
  id: string
  matchedBy: string
  name: string
  resolvedBy: 'auto' | 'manual'
}>

export type CteBatchPreviewProjection = Readonly<{
  baseAmount: string
  documents: readonly CteBatchPreviewDocument[]
  fiscalAmount: string
  fiscalComponents: readonly CteBatchPreviewComponent[]
  percentage: string
  profile: CteBatchPreviewProfile
  recipientTaxId: string
  senderTaxId: string
}>

export type CteBatchPreviewSummary = Readonly<{
  blockedCount: number
  documentCount: number
  projectedCount: number
  totalAmount: string
}>

export type CteBatchPreview = Readonly<{
  blocked: readonly CteBatchPreviewBlock[]
  projections: readonly CteBatchPreviewProjection[]
  summary: CteBatchPreviewSummary
}>
