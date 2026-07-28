/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteBatchSummary } from './cteBatchClient.service'

export const CTE_BATCH_CONDITION_FIELDS = [
  'name',
  'status',
  'itemCount',
  'createdAt',
  'updatedAt',
  'version',
] as const

export type CteBatchConditionField = (typeof CTE_BATCH_CONDITION_FIELDS)[number]

export type CteBatchConditionType = 'date' | 'number' | 'option' | 'text'

export const CTE_BATCH_CONDITION_FIELD_TYPE = {
  createdAt: 'date',
  itemCount: 'number',
  name: 'text',
  status: 'option',
  updatedAt: 'date',
  version: 'number',
} as const satisfies Record<CteBatchConditionField, CteBatchConditionType>

export const CTE_BATCH_OPERATORS_BY_TYPE = {
  date: ['between', 'eq', 'gte', 'lte'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'],
  option: ['eq', 'ne'],
  text: ['contains', 'notContains', 'eq', 'ne'],
} as const satisfies Record<CteBatchConditionType, readonly string[]>

export type CteBatchConditionOperator =
  (typeof CTE_BATCH_OPERATORS_BY_TYPE)[CteBatchConditionType][number]

const DEFAULT_OPERATOR_BY_TYPE = {
  date: 'between',
  number: 'eq',
  option: 'eq',
  text: 'contains',
} as const satisfies Record<CteBatchConditionType, CteBatchConditionOperator>

export type CteBatchCondition = Readonly<{
  field: CteBatchConditionField
  id: string
  operator: CteBatchConditionOperator
  value: string
  valueTo: string
}>

export type CteBatchConditionGroup = Readonly<{
  conditions: readonly CteBatchCondition[]
  connector: 'and' | 'or'
  id: string
}>

export type CteBatchAdvancedFilter = Readonly<{
  connector: 'and' | 'or'
  groups: readonly CteBatchConditionGroup[]
}>

function operatorsFor(field: CteBatchConditionField): readonly CteBatchConditionOperator[] {
  return CTE_BATCH_OPERATORS_BY_TYPE[CTE_BATCH_CONDITION_FIELD_TYPE[field]]
}

export function createCondition(id: string): CteBatchCondition {
  return { field: 'name', id, operator: 'contains', value: '', valueTo: '' }
}

export function createConditionGroup(nextId: () => string): CteBatchConditionGroup {
  return { conditions: [createCondition(nextId())], connector: 'and', id: nextId() }
}

export function createAdvancedFilterModel(nextId: () => string): CteBatchAdvancedFilter {
  return { connector: 'and', groups: [createConditionGroup(nextId)] }
}

export function applyConditionChanges(
  condition: CteBatchCondition,
  changes: Readonly<Partial<CteBatchCondition>>,
): CteBatchCondition {
  const merged = { ...condition, ...changes }
  if (changes.field === undefined || changes.field === condition.field) return merged
  return {
    field: merged.field,
    id: merged.id,
    operator: DEFAULT_OPERATOR_BY_TYPE[CTE_BATCH_CONDITION_FIELD_TYPE[merged.field]],
    value: '',
    valueTo: '',
  }
}

export function isConditionActive(condition: CteBatchCondition): boolean {
  if (!operatorsFor(condition.field).includes(condition.operator)) return false
  return condition.value.length > 0 || condition.valueTo.length > 0
}

export function countActiveConditions(model: CteBatchAdvancedFilter): number {
  return model.groups.reduce(
    (total, group) => total + group.conditions.filter(isConditionActive).length,
    0,
  )
}

function readNumber(batch: CteBatchSummary, field: CteBatchConditionField): number {
  return field === 'itemCount' ? batch.itemCount : Number(batch.version)
}

function readText(batch: CteBatchSummary, field: CteBatchConditionField): string {
  if (field === 'status') return batch.status
  if (field === 'createdAt') return batch.createdAt.slice(0, 10)
  if (field === 'updatedAt') return batch.updatedAt.slice(0, 10)
  return batch.name
}

function evaluateNumber(actual: number, condition: CteBatchCondition): boolean {
  const value = Number(condition.value)
  if (condition.operator === 'between') {
    const from = condition.value.length > 0 ? value : Number.NEGATIVE_INFINITY
    const to = condition.valueTo.length > 0 ? Number(condition.valueTo) : Number.POSITIVE_INFINITY
    return actual >= from && actual <= to
  }
  if (condition.operator === 'ne') return actual !== value
  if (condition.operator === 'gt') return actual > value
  if (condition.operator === 'gte') return actual >= value
  if (condition.operator === 'lt') return actual < value
  if (condition.operator === 'lte') return actual <= value
  return actual === value
}

function evaluateText(actual: string, condition: CteBatchCondition): boolean {
  const actualText = actual.toLocaleLowerCase('pt-BR')
  const expected = condition.value.toLocaleLowerCase('pt-BR')
  if (condition.operator === 'contains') return actualText.includes(expected)
  if (condition.operator === 'notContains') return !actualText.includes(expected)
  if (condition.operator === 'ne') return actualText !== expected
  return actualText === expected
}

function evaluateDate(actual: string, condition: CteBatchCondition): boolean {
  if (condition.operator === 'between') {
    if (condition.value.length > 0 && actual < condition.value) return false
    return !(condition.valueTo.length > 0 && actual > condition.valueTo)
  }
  if (condition.operator === 'gte') return actual >= condition.value
  if (condition.operator === 'lte') return actual <= condition.value
  return actual === condition.value
}

function evaluateCondition(batch: CteBatchSummary, condition: CteBatchCondition): boolean {
  const type = CTE_BATCH_CONDITION_FIELD_TYPE[condition.field]
  if (type === 'number') return evaluateNumber(readNumber(batch, condition.field), condition)
  if (type === 'date') return evaluateDate(readText(batch, condition.field), condition)
  return evaluateText(readText(batch, condition.field), condition)
}

function evaluateGroup(batch: CteBatchSummary, group: CteBatchConditionGroup): boolean {
  const active = group.conditions.filter(isConditionActive)
  if (active.length === 0) return true
  return group.connector === 'and'
    ? active.every((condition) => evaluateCondition(batch, condition))
    : active.some((condition) => evaluateCondition(batch, condition))
}

export function evaluateAdvancedFilter(
  batch: CteBatchSummary,
  model: CteBatchAdvancedFilter,
): boolean {
  const active = model.groups.filter(
    (group) => group.conditions.filter(isConditionActive).length > 0,
  )
  if (active.length === 0) return true
  return model.connector === 'and'
    ? active.every((group) => evaluateGroup(batch, group))
    : active.some((group) => evaluateGroup(batch, group))
}
