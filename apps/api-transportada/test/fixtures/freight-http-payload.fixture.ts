/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FreightCalculationDetail } from '../../src/freight-calculations/application/freight-simulation.use-case.js'
import type { FreightRuleSummary } from '../../src/freight-rules/application/freight-rules.use-case.js'

export const RULE_SUMMARY = {
  companyId: 'company-001',
  createdAt: '2026-07-22T19:00:00.000Z',
  createdByUserId: 'user-001',
  currentVersion: '1',
  description: 'Percentual padrão da operação',
  id: '00000000-0000-4000-8000-000000000301',
  name: 'Regra padrão',
  priority: '10',
  status: 'draft',
  type: 'percentage_of_invoice_total',
  updatedAt: '2026-07-22T19:00:00.000Z',
} as const satisfies FreightRuleSummary

export const SIMULATION_RESULT = {
  adjustments: [],
  baseAmount: '10000.0000',
  calculatedAmount: '350.0000',
  calculationDetails: {
    formula: 'invoiceTotalAmount * percentage',
    roundingMode: 'half_up',
    scale: 4,
  },
  companyId: 'company-001',
  correlationId: 'freight-http-correlation',
  createdAt: '2026-07-22T19:00:00.000Z',
  createdByUserId: 'user-001',
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
} as const satisfies FreightCalculationDetail

export const RULES_PAGE = {
  items: [RULE_SUMMARY],
  nextCursor: '2026-07-22T19:10:00.000Z::00000000-0000-4000-8000-000000000305',
} as const

export const SIMULATIONS_PAGE = {
  items: [SIMULATION_RESULT],
  nextCursor: '2026-07-22T19:10:00.000Z::00000000-0000-4000-8000-000000000306',
} as const

export function serializeRuleSummary(rule: FreightRuleSummary): FreightRuleSummary {
  return { ...rule }
}

export function serializeCalculationDetail(
  calculation: FreightCalculationDetail,
): FreightCalculationDetail {
  return {
    ...calculation,
    adjustments: calculation.adjustments.map((adjustment) => ({ ...adjustment })),
    calculationDetails: { ...calculation.calculationDetails },
    ruleSnapshot: { ...calculation.ruleSnapshot },
  }
}
