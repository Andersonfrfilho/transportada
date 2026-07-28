/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  ALL_COLUMNS_VISIBLE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  DOCUMENT_COLUMN_KEYS,
  EMPTY_FILTERS,
  type AdvancedFilterModel,
  type DocumentFilters,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import {
  parseTableViewPreferences,
  serializeTableViewPreferences,
  type TableViewPreferences,
} from '../../src/modules/nfe-workspace/shared/viewPreferences.serialization'

function fullPreferences(overrides: Partial<TableViewPreferences> = {}): TableViewPreferences {
  const filters: DocumentFilters = {
    ...EMPTY_FILTERS,
    amountOperator: 'lte',
    amountValue: '2500',
    dateFrom: '2026-01-01',
    numberFrom: '100',
    select: { ...EMPTY_FILTERS.select, recipientState: 'PR', status: 'authorized' },
    text: { ...EMPTY_FILTERS.text, emitterName: 'Alfa' },
  }
  const savedAdvancedFilter: AdvancedFilterModel = {
    connector: 'or',
    groups: [
      {
        conditions: [
          {
            field: 'totalAmount',
            id: 'condition-1',
            operator: 'gte',
            value: '5000',
            valueTo: '',
          },
        ],
        connector: 'and',
        id: 'group-1',
      },
    ],
  }
  return {
    columnOrder: [
      'status',
      'number',
      'series',
      'emitter',
      'emitterLocation',
      'recipient',
      'recipientLocation',
      'amount',
      'issuedAt',
    ],
    columnVisibility: { ...ALL_COLUMNS_VISIBLE, emitterLocation: false, recipientLocation: false },
    filters,
    pageSize: 100,
    savedAdvancedFilter,
    sort: { column: 'amount', direction: 'desc' },
    ...overrides,
  }
}

describe('nfe workspace view preferences serialization contract', () => {
  test('round-trips a complete view through serialize then parse', () => {
    const preferences = fullPreferences()

    const restored = parseTableViewPreferences(serializeTableViewPreferences(preferences))

    expect(restored).toEqual(preferences)
  })

  test('survives a JSON string boundary (the backend column type)', () => {
    const preferences = fullPreferences()

    const overWire: unknown = JSON.parse(JSON.stringify(serializeTableViewPreferences(preferences)))
    const restored = parseTableViewPreferences(overWire)

    expect(restored).toEqual(preferences)
  })

  test('a non-object payload yields the full default view', () => {
    for (const payload of [null, undefined, 42, 'nonsense', []]) {
      const restored = parseTableViewPreferences(payload)
      expect(restored).toEqual({
        columnOrder: DOCUMENT_COLUMN_KEYS,
        columnVisibility: ALL_COLUMNS_VISIBLE,
        filters: EMPTY_FILTERS,
        pageSize: DEFAULT_PAGE_SIZE,
        savedAdvancedFilter: null,
        sort: DEFAULT_SORT,
      })
    }
  })

  test('unknown and duplicate columns are dropped and missing columns appended in default order', () => {
    const restored = parseTableViewPreferences({
      columnOrder: ['amount', 'amount', 'ghost', 'status', 42],
    })

    expect(restored.columnOrder).toEqual([
      'amount',
      'status',
      'number',
      'series',
      'issuedAt',
      'emitter',
      'emitterLocation',
      'recipient',
      'recipientLocation',
    ])
  })

  test('column visibility keeps only boolean overrides and defaults the rest to visible', () => {
    const restored = parseTableViewPreferences({
      columnVisibility: { amount: false, status: 'yes', ghost: false },
    })

    expect(restored.columnVisibility).toEqual({ ...ALL_COLUMNS_VISIBLE, amount: false })
  })

  test('an invalid amount operator falls back to the empty-filter default', () => {
    const restored = parseTableViewPreferences({
      filters: { amountOperator: 'approx', amountValue: 10, select: null, text: 7 },
    })

    expect(restored.filters).toEqual(EMPTY_FILTERS)
  })

  test('an out-of-range page size falls back to the default', () => {
    expect(parseTableViewPreferences({ pageSize: 7 }).pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(parseTableViewPreferences({ pageSize: '100' }).pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(parseTableViewPreferences({ pageSize: 500 }).pageSize).toBe(500)
  })

  test('an explicit null sort is preserved but a malformed sort falls back to the default', () => {
    expect(parseTableViewPreferences({ sort: null }).sort).toBeNull()
    expect(parseTableViewPreferences({ sort: { column: 'ghost', direction: 'asc' } }).sort).toEqual(
      DEFAULT_SORT,
    )
    expect(
      parseTableViewPreferences({ sort: { column: 'amount', direction: 'sideways' } }).sort,
    ).toEqual(DEFAULT_SORT)
    expect(
      parseTableViewPreferences({ sort: { column: 'amount', direction: 'desc' } }).sort,
    ).toEqual({
      column: 'amount',
      direction: 'desc',
    })
  })

  test('a malformed saved advanced filter collapses to null', () => {
    expect(
      parseTableViewPreferences({ savedAdvancedFilter: { connector: 'xor', groups: [] } })
        .savedAdvancedFilter,
    ).toBeNull()
    expect(
      parseTableViewPreferences({ savedAdvancedFilter: 'nope' }).savedAdvancedFilter,
    ).toBeNull()
  })

  test('a saved advanced filter drops invalid groups and conditions but keeps valid ones', () => {
    const restored = parseTableViewPreferences({
      savedAdvancedFilter: {
        connector: 'and',
        groups: [
          { connector: 'nope', id: 'group-x', conditions: [] },
          {
            connector: 'and',
            id: 'group-1',
            conditions: [
              { field: 'ghost', id: 'c-1', operator: 'eq', value: 'x', valueTo: '' },
              { field: 'emitterName', id: 'c-2', operator: 'floop', value: 'x', valueTo: '' },
              { field: 'emitterName', id: '', operator: 'contains', value: 'x', valueTo: '' },
              { field: 'totalAmount', id: 'c-3', operator: 'gte', value: '5000', valueTo: '' },
            ],
          },
        ],
      },
    })

    expect(restored.savedAdvancedFilter).toEqual({
      connector: 'and',
      groups: [
        {
          connector: 'and',
          id: 'group-1',
          conditions: [
            { field: 'totalAmount', id: 'c-3', operator: 'gte', value: '5000', valueTo: '' },
          ],
        },
      ],
    })
  })
})
