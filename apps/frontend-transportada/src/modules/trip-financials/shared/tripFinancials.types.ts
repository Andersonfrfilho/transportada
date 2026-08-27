/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do vocabulário da API — o bundle não carrega código de lá. */
export const FINANCIAL_SOURCES = ['measured', 'estimated', 'missing', 'period'] as const
export type FinancialSource = (typeof FINANCIAL_SOURCES)[number]

export const FINANCIAL_PARCEL_KINDS = [
  'driver',
  'fuel',
  'other_per_kilometer',
  'delivery_charges',
  'toll',
  'manual',
  'icms',
  'pis_cofins',
] as const
export type FinancialParcelKind = (typeof FINANCIAL_PARCEL_KINDS)[number]

export type FinancialParcel = Readonly<{
  amount: string
  kind: FinancialParcelKind
  nature: 'cost' | 'tax'
  note: string
  source: FinancialSource
}>

export type TripFinancialResult = Readonly<{
  costTotal: string
  frozenAt: string
  /** Falso quando falta CT-e ou alguma parcela é desconhecida: o número existe e não é final. */
  isComplete: boolean
  marginRate: string | null
  netAmount: string
  parcels: readonly FinancialParcel[]
  recalculationReason: string
  revenueAmount: string
  revenueDocumentCount: number
  revenueExpectedCount: number
  taxTotal: string
  version: number
}>

export const FINANCIAL_SUMMARY_GROUPS = ['period', 'vehicle', 'driver'] as const
export type FinancialSummaryGroup = (typeof FINANCIAL_SUMMARY_GROUPS)[number]

export type FinancialSummaryRow = Readonly<{
  costTotal: string
  groupId: string
  groupLabel: string
  isComplete: boolean
  netAmount: string
  revenueAmount: string
  taxTotal: string
  tripCount: number
}>

export type FinancialSummary = Readonly<{
  costTotal: string
  groups: readonly FinancialSummaryRow[]
  isComplete: boolean
  marginRate: string | null
  netAmount: string
  /** `null` quando não há assalariado na frota — e `null` não é zero. */
  payrollAmount: string | null
  revenueAmount: string
  taxTotal: string
  tripCount: number
}>

export const FINANCIAL_RESULTS_PATH = '/financial-results'
