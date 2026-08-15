import { compareScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { NfseInvoice } from './nfseInvoice.types'

export const NFSE_INVOICE_CONDITION_FIELDS = [
  'takerLegalName',
  'takerTaxId',
  'status',
  'providerNumber',
  'verificationCode',
  'documentCount',
  'serviceAmount',
  'issAmount',
  'createdAt',
  'authorizedAt',
] as const
export type NfseInvoiceConditionField = (typeof NFSE_INVOICE_CONDITION_FIELDS)[number]

export type NfseConditionType = 'date' | 'number' | 'option' | 'text'

export const NFSE_INVOICE_CONDITION_FIELD_TYPE = {
  authorizedAt: 'date',
  createdAt: 'date',
  documentCount: 'number',
  issAmount: 'number',
  providerNumber: 'text',
  serviceAmount: 'number',
  status: 'option',
  takerLegalName: 'text',
  takerTaxId: 'text',
  verificationCode: 'text',
} as const satisfies Record<NfseInvoiceConditionField, NfseConditionType>

/** Dinheiro digita e opera como número, mas compara pela escala decimal — `Number` perde centavo. */
const MONEY_FIELDS: readonly NfseInvoiceConditionField[] = ['issAmount', 'serviceAmount']

export const NFSE_INVOICE_OPERATORS_BY_TYPE = {
  date: ['between', 'eq', 'gte', 'lte'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'],
  option: ['eq', 'ne'],
  text: ['contains', 'notContains', 'eq', 'ne'],
} as const satisfies Record<NfseConditionType, readonly string[]>

export type NfseConditionOperator =
  (typeof NFSE_INVOICE_OPERATORS_BY_TYPE)[NfseConditionType][number]

const DEFAULT_OPERATOR_BY_TYPE = {
  date: 'between',
  number: 'eq',
  option: 'eq',
  text: 'contains',
} as const satisfies Record<NfseConditionType, NfseConditionOperator>

export type NfseCondition = Readonly<{
  field: NfseInvoiceConditionField
  id: string
  operator: NfseConditionOperator
  value: string
  valueTo: string
}>

export type NfseConditionGroup = Readonly<{
  conditions: readonly NfseCondition[]
  connector: 'and' | 'or'
  id: string
}>

export type NfseAdvancedFilter = Readonly<{
  connector: 'and' | 'or'
  groups: readonly NfseConditionGroup[]
}>

export function operatorsForNfseField(
  field: NfseInvoiceConditionField,
): readonly NfseConditionOperator[] {
  return NFSE_INVOICE_OPERATORS_BY_TYPE[NFSE_INVOICE_CONDITION_FIELD_TYPE[field]]
}

export function createNfseCondition(id: string): NfseCondition {
  return { field: 'takerLegalName', id, operator: 'contains', value: '', valueTo: '' }
}

export function createNfseConditionGroup(nextId: () => string): NfseConditionGroup {
  return { conditions: [createNfseCondition(nextId())], connector: 'and', id: nextId() }
}

export function createNfseAdvancedFilterModel(nextId: () => string): NfseAdvancedFilter {
  return { connector: 'and', groups: [createNfseConditionGroup(nextId)] }
}

/**
 * Trocar o campo troca o tipo do valor: manter o operador e o texto antigos deixaria a condição
 * inativa sem que a tela dissesse por quê.
 */
export function applyNfseConditionChanges(
  condition: NfseCondition,
  changes: Partial<NfseCondition>,
): NfseCondition {
  const merged = { ...condition, ...changes }
  if (changes.field !== undefined && changes.field !== condition.field) {
    return {
      field: merged.field,
      id: merged.id,
      operator: DEFAULT_OPERATOR_BY_TYPE[NFSE_INVOICE_CONDITION_FIELD_TYPE[merged.field]],
      value: '',
      valueTo: '',
    }
  }
  if (merged.operator !== 'between') return { ...merged, valueTo: '' }
  return merged
}

export function isNfseConditionActive(condition: NfseCondition): boolean {
  if (!operatorsForNfseField(condition.field).includes(condition.operator)) return false
  return condition.value.length > 0 || condition.valueTo.length > 0
}

export function countActiveNfseConditions(model: NfseAdvancedFilter): number {
  return model.groups.reduce(
    (total, group) => total + group.conditions.filter(isNfseConditionActive).length,
    0,
  )
}

/** Sem nenhuma condição ativa o construtor não filtra nada — a tabela continua mostrando a página. */
export function evaluateNfseAdvancedFilter(
  invoice: NfseInvoice,
  model: NfseAdvancedFilter,
): boolean {
  const verdicts = model.groups
    .filter((group) => group.conditions.some(isNfseConditionActive))
    .map((group) => evaluateGroup(invoice, group))
  if (verdicts.length === 0) return true
  return model.connector === 'and' ? verdicts.every(Boolean) : verdicts.some(Boolean)
}

function evaluateGroup(invoice: NfseInvoice, group: NfseConditionGroup): boolean {
  const verdicts = group.conditions
    .filter(isNfseConditionActive)
    .map((condition) => evaluateCondition(invoice, condition))
  if (verdicts.length === 0) return true
  return group.connector === 'and' ? verdicts.every(Boolean) : verdicts.some(Boolean)
}

function evaluateCondition(invoice: NfseInvoice, condition: NfseCondition): boolean {
  const type = NFSE_INVOICE_CONDITION_FIELD_TYPE[condition.field]
  if (MONEY_FIELDS.includes(condition.field)) {
    return compareBy(compareScaledAmounts, invoice, condition)
  }
  if (type === 'number') return compareBy(compareNumbers, invoice, condition)
  if (type === 'date') return compareBy(compareDayPrefix, invoice, condition)
  return compareText(readField(invoice, condition.field), condition)
}

function compareBy(
  compare: (left: string, right: string) => number,
  invoice: NfseInvoice,
  condition: NfseCondition,
): boolean {
  const actual = readField(invoice, condition.field)
  if (actual.length === 0) return false
  switch (condition.operator) {
    case 'between':
      return (
        (condition.value.length === 0 || compare(actual, condition.value) >= 0) &&
        (condition.valueTo.length === 0 || compare(actual, condition.valueTo) <= 0)
      )
    case 'eq':
      return compare(actual, condition.value) === 0
    case 'gt':
      return compare(actual, condition.value) > 0
    case 'gte':
      return compare(actual, condition.value) >= 0
    case 'lt':
      return compare(actual, condition.value) < 0
    case 'lte':
      return compare(actual, condition.value) <= 0
    case 'ne':
      return compare(actual, condition.value) !== 0
    default:
      return false
  }
}

function compareText(actual: string, condition: NfseCondition): boolean {
  const left = actual.toLocaleLowerCase('pt-BR')
  const right = condition.value.toLocaleLowerCase('pt-BR')
  switch (condition.operator) {
    case 'contains':
      return left.includes(right)
    case 'eq':
      return left === right
    case 'ne':
      return left !== right
    case 'notContains':
      return !left.includes(right)
    default:
      return false
  }
}

function compareNumbers(left: string, right: string): number {
  return Number(left) - Number(right)
}

/** O filtro de data vem do calendário como `AAAA-MM-DD`; o campo é instante ISO, que começa igual. */
function compareDayPrefix(left: string, right: string): number {
  const day = left.slice(0, right.length)
  return day < right ? -1 : day > right ? 1 : 0
}

function readField(invoice: NfseInvoice, field: NfseInvoiceConditionField): string {
  const value = invoice[field]
  return value === null ? '' : String(value)
}
