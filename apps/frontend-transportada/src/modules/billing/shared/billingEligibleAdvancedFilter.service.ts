/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { BillingEligibleCte } from './billingClient.service'
import { toComparableAmount } from './billingEligibleFilterValue.service'

export const BILLING_ELIGIBLE_CONDITION_FIELDS = [
  'cteNumber',
  'nfeNumber',
  'customerName',
  'customerDocument',
  'batchName',
  'issuedAt',
  'totalAmount',
] as const

export type BillingEligibleConditionField = (typeof BILLING_ELIGIBLE_CONDITION_FIELDS)[number]

export type BillingEligibleConditionType = 'date' | 'money' | 'number' | 'text'

export const BILLING_ELIGIBLE_CONDITION_FIELD_TYPE = {
  batchName: 'text',
  cteNumber: 'number',
  customerDocument: 'text',
  customerName: 'text',
  issuedAt: 'date',
  nfeNumber: 'number',
  totalAmount: 'money',
} as const satisfies Record<BillingEligibleConditionField, BillingEligibleConditionType>

export const BILLING_ELIGIBLE_OPERATORS_BY_TYPE = {
  date: ['between', 'eq', 'gte', 'lte'],
  money: ['between', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'],
  text: ['contains', 'notContains', 'eq', 'ne'],
} as const satisfies Record<BillingEligibleConditionType, readonly string[]>

export type BillingEligibleConditionOperator =
  (typeof BILLING_ELIGIBLE_OPERATORS_BY_TYPE)[BillingEligibleConditionType][number]

const DEFAULT_OPERATOR_BY_TYPE = {
  date: 'between',
  money: 'between',
  number: 'eq',
  text: 'contains',
} as const satisfies Record<BillingEligibleConditionType, BillingEligibleConditionOperator>

const CTE_NUMBER_VALUE_PATTERN = /^\d{1,9}$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATE_LENGTH = 10

export type BillingEligibleCondition = Readonly<{
  field: BillingEligibleConditionField
  id: string
  operator: BillingEligibleConditionOperator
  value: string
  valueTo: string
}>

export type BillingEligibleConditionGroup = Readonly<{
  conditions: readonly BillingEligibleCondition[]
  connector: 'and' | 'or'
  id: string
}>

export type BillingEligibleAdvancedFilter = Readonly<{
  connector: 'and' | 'or'
  groups: readonly BillingEligibleConditionGroup[]
}>

function typeOf(field: BillingEligibleConditionField): BillingEligibleConditionType {
  return BILLING_ELIGIBLE_CONDITION_FIELD_TYPE[field]
}

export function createBillingEligibleCondition(id: string): BillingEligibleCondition {
  return { field: 'cteNumber', id, operator: 'eq', value: '', valueTo: '' }
}

export function createBillingEligibleConditionGroup(
  nextId: () => string,
): BillingEligibleConditionGroup {
  return { conditions: [createBillingEligibleCondition(nextId())], connector: 'and', id: nextId() }
}

export function createBillingEligibleAdvancedFilter(
  nextId: () => string,
): BillingEligibleAdvancedFilter {
  return { connector: 'and', groups: [createBillingEligibleConditionGroup(nextId)] }
}

/** Trocar o campo zera valor e operador — senão sobra um operador que o novo tipo não aceita. */
export function applyBillingEligibleConditionChanges(
  condition: BillingEligibleCondition,
  changes: Readonly<Partial<BillingEligibleCondition>>,
): BillingEligibleCondition {
  const merged = { ...condition, ...changes }
  if (changes.field === undefined || changes.field === condition.field) return merged
  return {
    field: merged.field,
    id: merged.id,
    operator: DEFAULT_OPERATOR_BY_TYPE[typeOf(merged.field)],
    value: '',
    valueTo: '',
  }
}

function isUsableValue(type: BillingEligibleConditionType, value: string): boolean {
  if (value.length === 0) return false
  if (type === 'money') return toComparableAmount(value) !== undefined
  if (type === 'number') return CTE_NUMBER_VALUE_PATTERN.test(value.trim())
  if (type === 'date') return ISO_DATE_PATTERN.test(value)
  return true
}

export function isBillingEligibleConditionActive(condition: BillingEligibleCondition): boolean {
  const type = typeOf(condition.field)
  const operators: readonly string[] = BILLING_ELIGIBLE_OPERATORS_BY_TYPE[type]
  if (!operators.includes(condition.operator)) return false
  if (condition.operator === 'between') {
    return isUsableValue(type, condition.value) || isUsableValue(type, condition.valueTo)
  }
  return isUsableValue(type, condition.value)
}

export function countActiveBillingEligibleConditions(model: BillingEligibleAdvancedFilter): number {
  return model.groups.reduce(
    (total, group) => total + group.conditions.filter(isBillingEligibleConditionActive).length,
    0,
  )
}

function evaluateComparison(comparison: number, operator: string): boolean {
  if (operator === 'ne') return comparison !== 0
  if (operator === 'gt') return comparison > 0
  if (operator === 'gte') return comparison >= 0
  if (operator === 'lt') return comparison < 0
  if (operator === 'lte') return comparison <= 0
  return comparison === 0
}

function evaluateRange(
  input: Readonly<{
    compare: (left: string, right: string) => number
    actual: string
    condition: BillingEligibleCondition
    type: BillingEligibleConditionType
  }>,
): boolean {
  const { actual, compare, condition, type } = input
  if (condition.operator !== 'between') {
    return evaluateComparison(compare(actual, condition.value), condition.operator)
  }
  if (isUsableValue(type, condition.value) && compare(actual, condition.value) < 0) return false
  return !(isUsableValue(type, condition.valueTo) && compare(actual, condition.valueTo) > 0)
}

function compareCteNumbers(left: string, right: string): number {
  if (!CTE_NUMBER_VALUE_PATTERN.test(right.trim())) return 0
  const difference = BigInt(left) - BigInt(right.trim())
  if (difference === 0n) return 0
  return difference > 0n ? 1 : -1
}

function compareAmounts(left: string, right: string): number {
  const expected = toComparableAmount(right)
  return expected === undefined ? 0 : compareScaledAmounts(left, expected)
}

function compareDates(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function evaluateText(actual: string, condition: BillingEligibleCondition): boolean {
  const actualText = actual.toLocaleLowerCase('pt-BR')
  const expected = condition.value.toLocaleLowerCase('pt-BR')
  if (condition.operator === 'contains') return actualText.includes(expected)
  if (condition.operator === 'notContains') return !actualText.includes(expected)
  if (condition.operator === 'ne') return actualText !== expected
  return actualText === expected
}

function readText(row: BillingEligibleCte, field: BillingEligibleConditionField): string {
  if (field === 'customerName') return row.customerName
  if (field === 'customerDocument') return row.customerDocument
  return row.batchName
}

function evaluateCondition(row: BillingEligibleCte, condition: BillingEligibleCondition): boolean {
  const type = typeOf(condition.field)
  if (type === 'number') {
    const actual = condition.field === 'nfeNumber' ? row.nfeNumber : row.cteNumber
    // Linha sem nota vinculada não satisfaz condição numérica nenhuma.
    if (actual === null) return false
    return evaluateRange({ actual, compare: compareCteNumbers, condition, type })
  }
  if (type === 'money') {
    return evaluateRange({ actual: row.totalAmount, compare: compareAmounts, condition, type })
  }
  if (type === 'date') {
    return evaluateRange({
      actual: row.issuedAt.slice(0, ISO_DATE_LENGTH),
      compare: compareDates,
      condition,
      type,
    })
  }
  return evaluateText(readText(row, condition.field), condition)
}

function evaluateGroup(row: BillingEligibleCte, group: BillingEligibleConditionGroup): boolean {
  const active = group.conditions.filter(isBillingEligibleConditionActive)
  if (active.length === 0) return true
  return group.connector === 'and'
    ? active.every((condition) => evaluateCondition(row, condition))
    : active.some((condition) => evaluateCondition(row, condition))
}

export function evaluateBillingEligibleAdvancedFilter(
  row: BillingEligibleCte,
  model: BillingEligibleAdvancedFilter,
): boolean {
  const active = model.groups.filter(
    (group) => group.conditions.filter(isBillingEligibleConditionActive).length > 0,
  )
  if (active.length === 0) return true
  return model.connector === 'and'
    ? active.every((group) => evaluateGroup(row, group))
    : active.some((group) => evaluateGroup(row, group))
}
