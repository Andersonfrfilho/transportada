/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do vocabulário da API — o bundle não carrega código de lá. */
export const DELIVERY_CHARGE_TYPES = [
  'unloading',
  'scheduling',
  'platform',
  'parking',
  'other',
] as const
export type DeliveryChargeType = (typeof DELIVERY_CHARGE_TYPES)[number]

export const DELIVERY_CHARGE_STATUSES = [
  'suggested',
  'dismissed',
  'recorded',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
] as const
export type DeliveryChargeStatus = (typeof DELIVERY_CHARGE_STATUSES)[number]

export type DeliveryCharge = Readonly<{
  amount: string
  batchId: string | null
  chargeType: DeliveryChargeType
  chargedOn: string
  contractorId: string | null
  deliveryClientId: string
  id: string
  notes: string
  origin: string
  rejectionReason: string
  status: DeliveryChargeStatus
}>

export type ExtraChargeBatch = Readonly<{
  closedAt: string
  contractorId: string
  id: string
  periodEnd: string
  periodStart: string
  status: string
  totalAmount: string
}>

export type ExtraChargeBatchReportItem = Readonly<{
  amount: string
  chargeType: DeliveryChargeType
  chargedOn: string
  clientName: string
  id: string
  notes: string
  rejectionReason: string
  status: string
}>

export type ExtraChargeBatchReport = Readonly<{
  batch: ExtraChargeBatch
  contractorName: string
  items: readonly ExtraChargeBatchReportItem[]
  /** Recalculado pela API a partir das linhas: o relatório confere o próprio total. */
  itemsTotal: string
}>

export type Contractor = Readonly<{
  closingPeriod: string
  displayName: string
  id: string
  taxId: string
}>

export const EXTRA_CHARGES_PATH = '/delivery-charges'
export const EXTRA_CHARGE_BATCHES_PATH = '/extra-charge-batches'
export const CONTRACTORS_PATH = '/contractors'

/**
 * Spec 164 T26 (RF28): a linha do relatório de cobranças de ocorrência — `trip.financials`,
 * `GET /occurrence-charges/report`. Recorte de elegibilidade é `batchId is null` (spec 164
 * plan.md § "O fechamento é por seleção, com filtros"), nunca "do mês corrente".
 */
export type OccurrenceChargeReportRow = Readonly<{
  accessKey: string | null
  amount: string
  chargeType: DeliveryChargeType
  chargedOn: string
  contractorId: string | null
  hasSettlement: boolean
  id: string
  noteNumber: string | null
  noteSeries: string | null
  occurrenceId: string | null
  status: DeliveryChargeStatus
  tripDocumentId: string | null
}>

export type OccurrenceChargeReportTotals = Readonly<{
  byChargeType: readonly Readonly<{
    amount: string
    chargeType: DeliveryChargeType
    count: number
  }>[]
  totalAmount: string
  totalCount: number
}>

export type OccurrenceChargeReportFilters = Readonly<{
  chargeType?: DeliveryChargeType
  contractorId?: string
  cursor?: string
  from?: string
  hasSettlement?: boolean
  limit?: number
  search?: string
  status?: DeliveryChargeStatus
  to?: string
}>

export type OccurrenceChargeReportPage = Readonly<{
  items: readonly OccurrenceChargeReportRow[]
  nextCursor: string | null
  totals: OccurrenceChargeReportTotals
}>

export const OCCURRENCE_CHARGES_REPORT_PATH = '/occurrence-charges/report'
