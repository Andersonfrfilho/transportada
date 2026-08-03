/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { BillingEligibleTableFilters } from './billingEligibleTable.service'

/** A ordem da lista é a ordem em que as pílulas aparecem na tela. */
export const BILLING_ELIGIBLE_PILL_FIELDS = [
  'batchId',
  'cteNumberQuery',
  'nfeNumberQuery',
  'customerName',
  'customerDocument',
  'minAmount',
  'maxAmount',
  'issuedRange',
  'advanced',
] as const

export type BillingEligiblePillField = (typeof BILLING_ELIGIBLE_PILL_FIELDS)[number]

export type BillingEligibleFilterPill = Readonly<{
  field: BillingEligiblePillField
  labelKey: string
  value: string
}>

type DescribePillsInput = Readonly<{
  advancedConditionCount: number
  filters: BillingEligibleTableFilters
  formatDay: (value: string) => string
}>

type ClearPillFieldInput = Readonly<{
  field: BillingEligiblePillField
  filters: BillingEligibleTableFilters
}>

const OPEN_RANGE_MARK = '…'
const RANGE_SEPARATOR = ' – '

function pill(field: BillingEligiblePillField, value: string): BillingEligibleFilterPill {
  return { field, labelKey: `eligible.filters.${field}`, value }
}

function describeIssuedRange(input: DescribePillsInput): string {
  const { issuedFrom, issuedTo } = input.filters
  if (issuedFrom.length === 0 && issuedTo.length === 0) return ''
  const from = issuedFrom.length === 0 ? OPEN_RANGE_MARK : input.formatDay(issuedFrom)
  const to = issuedTo.length === 0 ? OPEN_RANGE_MARK : input.formatDay(issuedTo)
  return `${from}${RANGE_SEPARATOR}${to}`
}

function describeField(field: BillingEligiblePillField, input: DescribePillsInput): string {
  if (field === 'issuedRange') return describeIssuedRange(input)
  if (field === 'advanced') {
    return input.advancedConditionCount > 0 ? String(input.advancedConditionCount) : ''
  }
  return input.filters[field].trim()
}

export function describeBillingEligibleFilterPills(
  input: DescribePillsInput,
): readonly BillingEligibleFilterPill[] {
  const pills: BillingEligibleFilterPill[] = []
  for (const field of BILLING_ELIGIBLE_PILL_FIELDS) {
    const value = describeField(field, input)
    if (value.length > 0) pills.push(pill(field, value))
  }
  return pills
}

/** O filtro avançado não mora no mapa de filtros simples: removê-lo é responsabilidade de quem chama. */
export function clearBillingEligibleFilterField(
  input: ClearPillFieldInput,
): BillingEligibleTableFilters {
  if (input.field === 'advanced') return input.filters
  if (input.field === 'issuedRange') return { ...input.filters, issuedFrom: '', issuedTo: '' }
  return { ...input.filters, [input.field]: '' }
}
