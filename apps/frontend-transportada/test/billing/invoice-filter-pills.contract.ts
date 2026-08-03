/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  clearBillingInvoiceFilterField,
  describeBillingInvoiceFilterPills,
  type BillingInvoiceFilterPill,
} from '../../src/modules/billing/shared/billingInvoiceFilterPills.service'
import {
  EMPTY_BILLING_INVOICE_FILTERS,
  type BillingInvoiceTableFilters,
} from '../../src/modules/billing/shared/billingInvoiceTable.service'

function buildFilters(
  overrides: Partial<BillingInvoiceTableFilters> = {},
): BillingInvoiceTableFilters {
  return { ...EMPTY_BILLING_INVOICE_FILTERS, ...overrides }
}

function formatDay(value: string): string {
  return value.split('-').reverse().join('/')
}

function describePills(filters: BillingInvoiceTableFilters): readonly BillingInvoiceFilterPill[] {
  return describeBillingInvoiceFilterPills({ filters, formatDay })
}

function fields(pills: readonly BillingInvoiceFilterPill[]): readonly string[] {
  return pills.map((pill) => pill.field)
}

describe('billing invoice filter pills contract', () => {
  test('describes nothing while no invoice filter is applied', () => {
    expect(describePills(buildFilters())).toEqual([])
  })

  test('describes one pill per applied filter, in the declared order', () => {
    const pills = describePills(
      buildFilters({ customerDocument: '12345678000199', invoiceNumber: '2026' }),
    )

    expect(fields(pills)).toEqual(['invoiceNumber', 'customerDocument'])
    expect(pills[0]).toEqual({
      field: 'invoiceNumber',
      labelKey: 'invoices.filters.invoiceNumber',
      value: '2026',
    })
  })

  test('names the status by key so the descriptor stays free of translation', () => {
    const pills = describePills(buildFilters({ status: 'cancelled' }))

    expect(pills).toEqual([
      {
        field: 'status',
        labelKey: 'invoices.filters.status',
        value: '',
        valueKey: 'invoices.statusOptions.cancelled',
      },
    ])
  })

  test('collapses each date range into a single pill, marking the open side', () => {
    const pills = describePills(buildFilters({ dueFrom: '2026-04-10', issuedTo: '2026-03-31' }))

    expect(fields(pills)).toEqual(['issuedRange', 'dueRange'])
    expect(pills[0]?.value).toBe('…–31/03/2026')
    expect(pills[1]?.value).toBe('10/04/2026–…')
  })

  test('ignores a value made only of whitespace', () => {
    expect(describePills(buildFilters({ invoiceNumber: '   ' }))).toEqual([])
  })

  test('clears only the target field, and both ends of a range', () => {
    const filters = buildFilters({
      dueFrom: '2026-04-10',
      dueTo: '2026-04-20',
      invoiceNumber: '2026',
    })

    expect(clearBillingInvoiceFilterField({ field: 'dueRange', filters })).toEqual(
      buildFilters({ invoiceNumber: '2026' }),
    )
    expect(clearBillingInvoiceFilterField({ field: 'invoiceNumber', filters })).toEqual(
      buildFilters({ dueFrom: '2026-04-10', dueTo: '2026-04-20' }),
    )
  })
})
