/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  describeNfeDocumentFilterPills,
  type NfeDocumentFilterPill,
} from '../../src/modules/nfe-workspace/shared/nfeDocumentFilterPills.service'
import {
  EMPTY_FILTERS,
  type DocumentFilters,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'

function buildFilters(overrides: Partial<DocumentFilters> = {}): DocumentFilters {
  return { ...EMPTY_FILTERS, ...overrides }
}

/** A data vira dia de calendário legível; o descritor não fala com `Intl` para não depender de fuso. */
function formatDay(value: string): string {
  return value.length === 0 ? '…' : value.split('-').reverse().join('/')
}

function describe_(filters: DocumentFilters): readonly NfeDocumentFilterPill[] {
  return describeNfeDocumentFilterPills({ filters, formatDay })
}

function keys(pills: readonly NfeDocumentFilterPill[]): readonly string[] {
  return pills.map((pill) => pill.key)
}

describe('nfe document filter pills contract', () => {
  test('describes nothing while the simple filters are untouched', () => {
    expect(describe_(buildFilters())).toEqual([])
  })

  test('describes one pill per filled text filter, in the declared order', () => {
    const pills = describe_(
      buildFilters({
        text: {
          emitterAddress: 'Rua das Cargas',
          emitterName: 'Transportes Alfa',
          recipientAddress: '   ',
          recipientName: 'Comércio Beta',
        },
      }),
    )

    expect(keys(pills)).toEqual(['emitterName', 'emitterAddress', 'recipientName'])
    expect(pills[0]).toEqual({
      key: 'emitterName',
      labelKey: 'documents.fields.emitterName',
      value: 'Transportes Alfa',
    })
  })

  test('translates the value of the select filters by key instead of by text', () => {
    const pills = describe_(
      buildFilters({
        select: { ...EMPTY_FILTERS.select, status: 'cancelled' },
      }),
    )

    expect(pills).toEqual([
      {
        key: 'status',
        labelKey: 'documents.fields.status',
        value: '',
        valueKey: 'documentStatus.cancelled',
      },
    ])
  })

  test('shows the cte issued filter only when it leaves the default, and names the empty choice', () => {
    expect(describe_(buildFilters())).toEqual([])

    const issued = describe_(
      buildFilters({ select: { ...EMPTY_FILTERS.select, cteIssued: 'issued' } }),
    )
    expect(issued[0]?.valueKey).toBe('filters.cteIssuedIssued')

    const every = describe_(buildFilters({ select: { ...EMPTY_FILTERS.select, cteIssued: '' } }))
    expect(every[0]?.valueKey).toBe('filters.all')
  })

  test('collapses the number and the date range into a single pill, marking the open side', () => {
    const pills = describe_(
      buildFilters({ dateFrom: '2026-03-01', numberFrom: '1200', numberTo: '', dateTo: '' }),
    )

    expect(keys(pills)).toEqual(['numberRange', 'dateRange'])
    expect(pills[0]?.value).toBe('1200–…')
    expect(pills[1]?.value).toBe('01/03/2026 – …')
  })

  test('keeps the amount operator symbol beside the amount', () => {
    const pills = describe_(buildFilters({ amountOperator: 'lte', amountValue: '1500.00' }))

    expect(pills).toEqual([
      {
        key: 'amount',
        labelKey: 'documents.fields.totalAmount',
        value: '≤ 1500.00',
      },
    ])
  })

  test('ignores a value made only of whitespace', () => {
    expect(describe_(buildFilters({ amountValue: '   ', numberFrom: '  ' }))).toEqual([])
  })
})
