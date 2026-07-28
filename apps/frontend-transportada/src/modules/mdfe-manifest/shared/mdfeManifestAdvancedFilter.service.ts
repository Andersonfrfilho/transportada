/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { MdfeManifestSummary } from './mdfeManifest.types'

export const MDFE_MANIFEST_CONDITION_FIELDS = [
  'fiscalNumber',
  'status',
  'vehicleId',
  'originState',
  'destinationState',
  'cteCount',
  'cargoValue',
  'cargoWeight',
  'createdAt',
  'updatedAt',
] as const

export type MdfeManifestConditionField = (typeof MDFE_MANIFEST_CONDITION_FIELDS)[number]

export type MdfeManifestConditionType = 'date' | 'number' | 'option' | 'text'

export const MDFE_MANIFEST_CONDITION_FIELD_TYPE = {
  cargoValue: 'number',
  cargoWeight: 'number',
  createdAt: 'date',
  cteCount: 'number',
  destinationState: 'text',
  fiscalNumber: 'text',
  originState: 'text',
  status: 'option',
  updatedAt: 'date',
  vehicleId: 'text',
} as const satisfies Record<MdfeManifestConditionField, MdfeManifestConditionType>

export const MDFE_MANIFEST_OPERATORS_BY_TYPE = {
  date: ['between', 'eq', 'gte', 'lte'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'],
  option: ['eq', 'ne'],
  text: ['contains', 'notContains', 'eq', 'ne'],
} as const satisfies Record<MdfeManifestConditionType, readonly string[]>

export type MdfeManifestConditionOperator =
  (typeof MDFE_MANIFEST_OPERATORS_BY_TYPE)[MdfeManifestConditionType][number]

const DEFAULT_OPERATOR_BY_TYPE = {
  date: 'between',
  number: 'eq',
  option: 'eq',
  text: 'contains',
} as const satisfies Record<MdfeManifestConditionType, MdfeManifestConditionOperator>

export type MdfeManifestCondition = Readonly<{
  field: MdfeManifestConditionField
  id: string
  operator: MdfeManifestConditionOperator
  value: string
  valueTo: string
}>

export type MdfeManifestConditionGroup = Readonly<{
  conditions: readonly MdfeManifestCondition[]
  connector: 'and' | 'or'
  id: string
}>

export type MdfeManifestAdvancedFilter = Readonly<{
  connector: 'and' | 'or'
  groups: readonly MdfeManifestConditionGroup[]
}>

function operatorsFor(field: MdfeManifestConditionField): readonly MdfeManifestConditionOperator[] {
  return MDFE_MANIFEST_OPERATORS_BY_TYPE[MDFE_MANIFEST_CONDITION_FIELD_TYPE[field]]
}

export function createCondition(id: string): MdfeManifestCondition {
  return { field: 'fiscalNumber', id, operator: 'contains', value: '', valueTo: '' }
}

export function createConditionGroup(nextId: () => string): MdfeManifestConditionGroup {
  return { conditions: [createCondition(nextId())], connector: 'and', id: nextId() }
}

export function createAdvancedFilterModel(nextId: () => string): MdfeManifestAdvancedFilter {
  return { connector: 'and', groups: [createConditionGroup(nextId)] }
}

export function applyConditionChanges(
  condition: MdfeManifestCondition,
  changes: Readonly<Partial<MdfeManifestCondition>>,
): MdfeManifestCondition {
  const merged = { ...condition, ...changes }
  if (changes.field === undefined || changes.field === condition.field) return merged
  return {
    field: merged.field,
    id: merged.id,
    operator: DEFAULT_OPERATOR_BY_TYPE[MDFE_MANIFEST_CONDITION_FIELD_TYPE[merged.field]],
    value: '',
    valueTo: '',
  }
}

export function isConditionActive(condition: MdfeManifestCondition): boolean {
  if (!operatorsFor(condition.field).includes(condition.operator)) return false
  return condition.value.length > 0 || condition.valueTo.length > 0
}

export function countActiveConditions(model: MdfeManifestAdvancedFilter): number {
  return model.groups.reduce(
    (total, group) => total + group.conditions.filter(isConditionActive).length,
    0,
  )
}

function readNumber(manifest: MdfeManifestSummary, field: MdfeManifestConditionField): number {
  if (field === 'cteCount') return manifest.cteCount
  if (field === 'cargoWeight') return Number(manifest.cargoWeight)
  return Number(manifest.cargoValue)
}

function readText(manifest: MdfeManifestSummary, field: MdfeManifestConditionField): string {
  if (field === 'status') return manifest.status
  if (field === 'createdAt') return manifest.createdAt.slice(0, 10)
  if (field === 'updatedAt') return manifest.updatedAt.slice(0, 10)
  if (field === 'vehicleId') return manifest.vehicleId
  if (field === 'originState') return manifest.originState
  if (field === 'destinationState') return manifest.destinationState
  return manifest.fiscalNumber ?? ''
}

function evaluateNumber(actual: number, condition: MdfeManifestCondition): boolean {
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

function evaluateText(actual: string, condition: MdfeManifestCondition): boolean {
  const actualText = actual.toLocaleLowerCase('pt-BR')
  const expected = condition.value.toLocaleLowerCase('pt-BR')
  if (condition.operator === 'contains') return actualText.includes(expected)
  if (condition.operator === 'notContains') return !actualText.includes(expected)
  if (condition.operator === 'ne') return actualText !== expected
  return actualText === expected
}

function evaluateDate(actual: string, condition: MdfeManifestCondition): boolean {
  if (condition.operator === 'between') {
    if (condition.value.length > 0 && actual < condition.value) return false
    return !(condition.valueTo.length > 0 && actual > condition.valueTo)
  }
  if (condition.operator === 'gte') return actual >= condition.value
  if (condition.operator === 'lte') return actual <= condition.value
  return actual === condition.value
}

function evaluateCondition(
  manifest: MdfeManifestSummary,
  condition: MdfeManifestCondition,
): boolean {
  const type = MDFE_MANIFEST_CONDITION_FIELD_TYPE[condition.field]
  if (type === 'number') return evaluateNumber(readNumber(manifest, condition.field), condition)
  if (type === 'date') return evaluateDate(readText(manifest, condition.field), condition)
  return evaluateText(readText(manifest, condition.field), condition)
}

function evaluateGroup(manifest: MdfeManifestSummary, group: MdfeManifestConditionGroup): boolean {
  const active = group.conditions.filter(isConditionActive)
  if (active.length === 0) return true
  return group.connector === 'and'
    ? active.every((condition) => evaluateCondition(manifest, condition))
    : active.some((condition) => evaluateCondition(manifest, condition))
}

export function evaluateAdvancedFilter(
  manifest: MdfeManifestSummary,
  model: MdfeManifestAdvancedFilter,
): boolean {
  const active = model.groups.filter(
    (group) => group.conditions.filter(isConditionActive).length > 0,
  )
  if (active.length === 0) return true
  return model.connector === 'and'
    ? active.every((group) => evaluateGroup(manifest, group))
    : active.some((group) => evaluateGroup(manifest, group))
}
