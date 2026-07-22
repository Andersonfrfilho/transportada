/* Copyright (c) 2026 Ada Technology. MIT License. */
export const FREIGHT_SIMULATE = 'freight.simulate'
export const SETTINGS_MANAGE = 'settings.manage'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR =
  'WyIyMDI2LTA3LTIyVDE5OjAwOjAwLjAwMFoiLCIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAzMDEiXQ'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'freight-contract-key-0001'

export type FreightRuleSummaryContract = Readonly<{
  createdAt: string
  currentVersion: string
  description: string
  id: string
  name: string
  priority: string
  status: 'active' | 'draft' | 'inactive'
  type: 'percentage_of_invoice_total'
  updatedAt: string
}>

export type FreightRuleListPageContract = Readonly<{
  items: readonly FreightRuleSummaryContract[]
  nextCursor: null | string
}>

export type FreightSimulationRequestContract = Readonly<{
  documentId: string
}>

export type FreightSimulationResultContract = Readonly<{
  adjustments: readonly Readonly<{
    amount: string
    description: string
    type: 'maximum_amount' | 'minimum_amount'
  }>[]
  baseAmount: string
  calculatedAmount: string
  calculationDetails: Readonly<{
    formula: string
    roundingMode: 'half_up'
    scale: 4
  }>
  correlationId: string
  createdAt: string
  freightRuleId: string
  freightRuleVersionId: string
  id: string
  maximumAmount: null | string
  minimumAmount: null | string
  nfeDocumentId: string
  percentage: string
  ruleSnapshot: Readonly<{
    freightRuleId: string
    freightRuleVersionId: string
    maximumAmount: null | string
    minimumAmount: null | string
    percentage: string
    ruleVersion: string
    type: 'percentage_of_invoice_total'
    validFrom: string
    validUntil: null | string
  }>
  ruleVersion: string
  status: 'rejected' | 'snapshotted'
  totalAmount: string
  updatedAt: string
}>

export type FreightCalculationListPageContract = Readonly<{
  items: readonly FreightSimulationResultContract[]
  nextCursor: null | string
}>

export const FREIGHT_RULE = {
  createdAt: '2026-07-22T19:00:00.000Z',
  currentVersion: '1',
  description: 'Percentual padrão da operação',
  id: '00000000-0000-4000-8000-000000000301',
  name: 'Regra padrão',
  priority: '10',
  status: 'draft',
  type: 'percentage_of_invoice_total',
  updatedAt: '2026-07-22T19:00:00.000Z',
} as const satisfies FreightRuleSummaryContract

export const FREIGHT_RULE_CREATE = {
  description: 'Percentual padrão da operação',
  maximumAmount: null,
  minimumAmount: null,
  name: 'Regra padrão',
  percentage: '0.035000',
  priority: '10',
  validFrom: '2026-07-01T00:00:00.000Z',
  validUntil: null,
} as const

export const FREIGHT_SIMULATION_REQUEST = {
  documentId: '00000000-0000-4000-8000-000000000304',
} as const satisfies FreightSimulationRequestContract

export const FREIGHT_SIMULATION_RESULT = {
  adjustments: [],
  baseAmount: '10000.0000',
  calculatedAmount: '350.0000',
  calculationDetails: {
    formula: 'invoiceTotalAmount * percentage',
    roundingMode: 'half_up',
    scale: 4,
  },
  correlationId: 'freight-http-correlation',
  createdAt: '2026-07-22T19:00:00.000Z',
  freightRuleId: '00000000-0000-4000-8000-000000000301',
  freightRuleVersionId: '00000000-0000-4000-8000-000000000302',
  id: '00000000-0000-4000-8000-000000000303',
  maximumAmount: null,
  minimumAmount: null,
  nfeDocumentId: '00000000-0000-4000-8000-000000000304',
  percentage: '0.035000',
  ruleSnapshot: {
    freightRuleId: '00000000-0000-4000-8000-000000000301',
    freightRuleVersionId: '00000000-0000-4000-8000-000000000302',
    maximumAmount: null,
    minimumAmount: null,
    percentage: '0.035000',
    ruleVersion: '1',
    type: 'percentage_of_invoice_total',
    validFrom: '2026-07-01T00:00:00.000Z',
    validUntil: null,
  },
  ruleVersion: '1',
  status: 'snapshotted',
  totalAmount: '350.0000',
  updatedAt: '2026-07-22T19:00:00.000Z',
} as const satisfies FreightSimulationResultContract

export const FREIGHT_RULE_LIST_PAGE = {
  items: [FREIGHT_RULE],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies FreightRuleListPageContract

export const FREIGHT_CALCULATION_LIST_PAGE = {
  items: [FREIGHT_SIMULATION_RESULT],
  nextCursor: null,
} as const satisfies FreightCalculationListPageContract

export type FreightDocumentOptionContract = Readonly<{
  id: string
  issuedAt: string
  label: string
  status: 'authorized' | 'cancelled' | 'denied'
  totalAmount: string
  variant: 'complete' | 'event' | 'summary'
}>

export const FREIGHT_DOCUMENT = {
  id: FREIGHT_SIMULATION_REQUEST.documentId,
  issuedAt: '2026-07-22T10:00:00.000Z',
  label: '35190730290856000160550010000000011000000010',
  status: 'authorized',
  totalAmount: '10000.0000',
  variant: 'complete',
} as const satisfies FreightDocumentOptionContract

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
