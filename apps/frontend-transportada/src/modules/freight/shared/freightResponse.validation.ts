/* Copyright (c) 2026 Ada Technology. MIT License. */
function validationError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function isMoneyDecimal(value: unknown): value is string {
  return isString(value) && /^(?:0|[1-9][0-9]{0,14})\.[0-9]{4}$/.test(value)
}

function isNullableMoneyDecimal(value: unknown): value is null | string {
  return value === null || isMoneyDecimal(value)
}

function isPercentageDecimal(value: unknown): value is string {
  return isString(value) && /^(?:0|0\.[0-9]{6}|1|1\.000000)$/.test(value)
}

function isRuleStatus(value: unknown): value is 'active' | 'draft' | 'inactive' {
  return isString(value) && ['active', 'draft', 'inactive'].includes(value)
}

function isRuleType(value: unknown): value is 'percentage_of_invoice_total' {
  return value === 'percentage_of_invoice_total'
}

function isAdjustment(value: unknown): value is FreightSimulationResult['adjustments'][number] {
  return (
    isRecord(value) &&
    isMoneyDecimal(value.amount) &&
    isString(value.description) &&
    (value.type === 'minimum_amount' || value.type === 'maximum_amount')
  )
}

function isCalculationDetails(
  value: unknown,
): value is FreightSimulationResult['calculationDetails'] {
  return (
    isRecord(value) &&
    isString(value.formula) &&
    value.roundingMode === 'half_up' &&
    value.scale === 4
  )
}

function isRuleSnapshot(value: unknown): value is FreightSimulationResult['ruleSnapshot'] {
  return (
    isRecord(value) &&
    isString(value.freightRuleId) &&
    isString(value.freightRuleVersionId) &&
    isNullableMoneyDecimal(value.maximumAmount) &&
    isNullableMoneyDecimal(value.minimumAmount) &&
    isPercentageDecimal(value.percentage) &&
    isString(value.ruleVersion) &&
    isRuleType(value.type) &&
    isString(value.validFrom) &&
    isNullableString(value.validUntil)
  )
}

function rejectExtraKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw validationError(code)
  }
}

export function createFreightResponseAdapters() {
  return {
    calculationListFromApi(input: unknown): FreightCalculationListPage {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) {
        throw validationError('FREIGHT_INVALID_CALCULATION_LIST_RESPONSE')
      }
      const nextCursor = input.page.nextCursor
      if (nextCursor !== null && !isString(nextCursor)) {
        throw validationError('FREIGHT_INVALID_CALCULATION_LIST_RESPONSE')
      }
      try {
        return {
          items: input.data.map((item) => this.simulationFromApi(item)),
          nextCursor,
        }
      } catch {
        throw validationError('FREIGHT_INVALID_CALCULATION_LIST_RESPONSE')
      }
    },
    ruleFromApi(input: unknown): FreightRuleSummary {
      if (!isRecord(input)) {
        throw validationError('FREIGHT_INVALID_RULE_RESPONSE')
      }
      rejectExtraKeys(
        input,
        [
          'createdAt',
          'currentVersion',
          'description',
          'id',
          'name',
          'priority',
          'status',
          'type',
          'updatedAt',
        ],
        'FREIGHT_INVALID_RULE_RESPONSE',
      )
      if (
        !isString(input.createdAt) ||
        !isString(input.currentVersion) ||
        !isString(input.description) ||
        !isString(input.id) ||
        !isString(input.name) ||
        !isString(input.priority) ||
        !isRuleStatus(input.status) ||
        !isRuleType(input.type) ||
        !isString(input.updatedAt)
      ) {
        throw validationError('FREIGHT_INVALID_RULE_RESPONSE')
      }
      return {
        createdAt: input.createdAt,
        currentVersion: input.currentVersion,
        description: input.description,
        id: input.id,
        name: input.name,
        priority: input.priority,
        status: input.status,
        type: input.type,
        updatedAt: input.updatedAt,
      }
    },
    simulationFromApi(input: unknown): FreightSimulationResult {
      if (!isRecord(input)) {
        throw validationError('FREIGHT_INVALID_SIMULATION_RESPONSE')
      }
      rejectExtraKeys(
        input,
        [
          'adjustments',
          'baseAmount',
          'calculatedAmount',
          'calculationDetails',
          'correlationId',
          'createdAt',
          'freightRuleId',
          'freightRuleVersionId',
          'id',
          'maximumAmount',
          'minimumAmount',
          'nfeDocumentId',
          'percentage',
          'ruleSnapshot',
          'ruleVersion',
          'status',
          'totalAmount',
          'updatedAt',
        ],
        'FREIGHT_INVALID_SIMULATION_RESPONSE',
      )
      if (
        !Array.isArray(input.adjustments) ||
        !input.adjustments.every(isAdjustment) ||
        !isMoneyDecimal(input.baseAmount) ||
        !isMoneyDecimal(input.calculatedAmount) ||
        !isCalculationDetails(input.calculationDetails) ||
        !isString(input.correlationId) ||
        !isString(input.createdAt) ||
        !isString(input.freightRuleId) ||
        !isString(input.freightRuleVersionId) ||
        !isString(input.id) ||
        !isNullableMoneyDecimal(input.maximumAmount) ||
        !isNullableMoneyDecimal(input.minimumAmount) ||
        !isString(input.nfeDocumentId) ||
        !isPercentageDecimal(input.percentage) ||
        !isRuleSnapshot(input.ruleSnapshot) ||
        !isString(input.ruleVersion) ||
        !['rejected', 'snapshotted'].includes(String(input.status)) ||
        !isMoneyDecimal(input.totalAmount) ||
        !isString(input.updatedAt)
      ) {
        throw validationError('FREIGHT_INVALID_SIMULATION_RESPONSE')
      }
      const calculationDetails: FreightSimulationResult['calculationDetails'] = {
        formula: input.calculationDetails.formula,
        roundingMode: 'half_up',
        scale: 4,
      }
      const ruleSnapshot: FreightSimulationResult['ruleSnapshot'] = {
        freightRuleId: input.ruleSnapshot.freightRuleId,
        freightRuleVersionId: input.ruleSnapshot.freightRuleVersionId,
        maximumAmount: input.ruleSnapshot.maximumAmount,
        minimumAmount: input.ruleSnapshot.minimumAmount,
        percentage: input.ruleSnapshot.percentage,
        ruleVersion: input.ruleSnapshot.ruleVersion,
        type: 'percentage_of_invoice_total',
        validFrom: input.ruleSnapshot.validFrom,
        validUntil: input.ruleSnapshot.validUntil,
      }
      return {
        adjustments: input.adjustments,
        baseAmount: input.baseAmount,
        calculatedAmount: input.calculatedAmount,
        calculationDetails,
        correlationId: input.correlationId,
        createdAt: input.createdAt,
        freightRuleId: input.freightRuleId,
        freightRuleVersionId: input.freightRuleVersionId,
        id: input.id,
        maximumAmount: input.maximumAmount,
        minimumAmount: input.minimumAmount,
        nfeDocumentId: input.nfeDocumentId,
        percentage: input.percentage,
        ruleSnapshot,
        ruleVersion: input.ruleVersion,
        status: input.status as 'rejected' | 'snapshotted',
        totalAmount: input.totalAmount,
        updatedAt: input.updatedAt,
      }
    },
  }
}
type FreightRuleSummary = Readonly<{
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

type FreightSimulationResult = Readonly<{
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

type FreightCalculationListPage = Readonly<{
  items: readonly FreightSimulationResult[]
  nextCursor: null | string
}>
