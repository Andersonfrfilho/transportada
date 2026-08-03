/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describeRangeValue } from '@/modules/shared/filterPill.service'

import {
  BILLING_INVOICE_DATE_RANGES,
  type BillingInvoiceDateRangeField,
  type BillingInvoiceTableFilters,
} from './billingInvoiceTable.service'

/** A ordem da lista é a ordem em que as pílulas aparecem na tela. */
export const BILLING_INVOICE_PILL_FIELDS = [
  'invoiceNumber',
  'customerDocument',
  'status',
  'issuedRange',
  'dueRange',
] as const

export type BillingInvoicePillField = (typeof BILLING_INVOICE_PILL_FIELDS)[number]

export type BillingInvoiceFilterPill = Readonly<{
  field: BillingInvoicePillField
  labelKey: string
  value: string
  valueKey?: string
}>

type DescribePillsInput = Readonly<{
  filters: BillingInvoiceTableFilters
  formatDay: (value: string) => string
}>

type ClearPillFieldInput = Readonly<{
  field: BillingInvoicePillField
  filters: BillingInvoiceTableFilters
}>

function labelKey(field: BillingInvoicePillField): string {
  return `invoices.filters.${field}`
}

function isDateRangeField(field: BillingInvoicePillField): field is BillingInvoiceDateRangeField {
  return field in BILLING_INVOICE_DATE_RANGES
}

function describeField(
  field: BillingInvoicePillField,
  input: DescribePillsInput,
): BillingInvoiceFilterPill | null {
  const { filters, formatDay } = input
  if (isDateRangeField(field)) {
    const range = BILLING_INVOICE_DATE_RANGES[field]
    const value = describeRangeValue({
      format: formatDay,
      from: filters[range.from],
      to: filters[range.to],
    })
    return value.length === 0 ? null : { field, labelKey: labelKey(field), value }
  }
  if (field === 'status') {
    const status = filters.status.trim()
    if (status.length === 0) return null
    return {
      field,
      labelKey: labelKey(field),
      value: '',
      valueKey: `invoices.statusOptions.${status}`,
    }
  }
  const value = filters[field].trim()
  return value.length === 0 ? null : { field, labelKey: labelKey(field), value }
}

export function describeBillingInvoiceFilterPills(
  input: DescribePillsInput,
): readonly BillingInvoiceFilterPill[] {
  const pills: BillingInvoiceFilterPill[] = []
  for (const field of BILLING_INVOICE_PILL_FIELDS) {
    const pill = describeField(field, input)
    if (pill !== null) pills.push(pill)
  }
  return pills
}

export function clearBillingInvoiceFilterField(
  input: ClearPillFieldInput,
): BillingInvoiceTableFilters {
  if (isDateRangeField(input.field)) {
    const range = BILLING_INVOICE_DATE_RANGES[input.field]
    return { ...input.filters, [range.from]: '', [range.to]: '' }
  }
  return { ...input.filters, [input.field]: '' }
}
