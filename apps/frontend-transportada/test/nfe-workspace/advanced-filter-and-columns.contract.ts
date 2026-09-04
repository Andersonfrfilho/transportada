/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  countActiveConditions,
  documentMatchesSimpleMode,
  EMPTY_FILTERS,
  evaluateAdvancedFilter,
  reorderColumns,
  type AdvancedFilterModel,
  type ColumnKey,
  type DocumentFilters,
  type FilterCondition,
  type FilterGroup,
  type GroupConnector,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import type { NfeDocumentListItem } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

function buildDocument(overrides: Partial<NfeDocumentListItem> = {}): NfeDocumentListItem {
  return {
    accessKey: '35240712345678000199550010000000011000000010',
    cteBlockReason: null,
    nfseBlockReason: null,
    tripId: null,
    tripStatus: null,
    emitterAddress: 'Rua das Cargas, 100',
    emitterCity: 'São Paulo',
    emitterCityCode: '3550308',
    emitterName: 'Transportes Alfa',
    emitterState: 'SP',
    emitterTaxId: '12345678000199',
    id: 'doc-1',
    issuedAt: '2026-03-15T09:00:00.000Z',
    nfseInvoiceId: null,
    nfseInvoiceNumber: null,
    number: '1200',
    recipientAddress: 'Av. Central, 200',
    recipientPostalCode: '14020000',
    recipientAddressNumber: null,
    recipientLatitude: null,
    recipientLongitude: null,
    recipientLocationPrecision: null,
    recipientCity: 'Curitiba',
    recipientCityCode: '4106902',
    recipientName: 'Comércio Beta',
    recipientState: 'PR',
    recipientTaxId: '98765432000155',
    series: '1',
    status: 'authorized',
    totalAmount: '1500.0000',
    variant: 'complete',
    ...overrides,
  }
}

let conditionCounter = 0
function condition(overrides: Partial<FilterCondition>): FilterCondition {
  conditionCounter += 1
  return {
    field: 'emitterName',
    id: `condition-${String(conditionCounter)}`,
    operator: 'contains',
    value: '',
    valueTo: '',
    ...overrides,
  }
}

let groupCounter = 0
function group(connector: GroupConnector, conditions: readonly FilterCondition[]): FilterGroup {
  groupCounter += 1
  return { conditions, connector, id: `group-${String(groupCounter)}` }
}

function model(connector: GroupConnector, groups: readonly FilterGroup[]): AdvancedFilterModel {
  return { connector, groups }
}

describe('nfe workspace advanced filter evaluator contract', () => {
  test('a model with no filled conditions matches every document (neutral)', () => {
    const empty = model('and', [group('and', [condition({})])])
    expect(evaluateAdvancedFilter(buildDocument(), empty)).toBe(true)
    expect(countActiveConditions(empty)).toBe(0)
  })

  test('AND connector inside a group requires every filled condition to pass', () => {
    const filter = model('and', [
      group('and', [
        condition({ field: 'emitterName', operator: 'contains', value: 'Alfa' }),
        condition({ field: 'recipientState', operator: 'eq', value: 'PR' }),
      ]),
    ])
    expect(evaluateAdvancedFilter(buildDocument(), filter)).toBe(true)
    expect(evaluateAdvancedFilter(buildDocument({ recipientState: 'SC' }), filter)).toBe(false)
    expect(countActiveConditions(filter)).toBe(2)
  })

  test('OR connector inside a group passes when at least one filled condition matches', () => {
    const filter = model('and', [
      group('or', [
        condition({ field: 'emitterState', operator: 'eq', value: 'RJ' }),
        condition({ field: 'recipientState', operator: 'eq', value: 'PR' }),
      ]),
    ])
    expect(evaluateAdvancedFilter(buildDocument(), filter)).toBe(true)
    expect(evaluateAdvancedFilter(buildDocument({ recipientState: 'SC' }), filter)).toBe(false)
  })

  test('root OR combines groups: (emitterState=SP) OR (totalAmount>=5000)', () => {
    const filter = model('or', [
      group('and', [condition({ field: 'emitterState', operator: 'eq', value: 'SP' })]),
      group('and', [condition({ field: 'totalAmount', operator: 'gte', value: '5000' })]),
    ])
    expect(evaluateAdvancedFilter(buildDocument({ emitterState: 'SP' }), filter)).toBe(true)
    expect(
      evaluateAdvancedFilter(
        buildDocument({ emitterState: 'MG', totalAmount: '9000.0000' }),
        filter,
      ),
    ).toBe(true)
    expect(
      evaluateAdvancedFilter(
        buildDocument({ emitterState: 'MG', totalAmount: '100.0000' }),
        filter,
      ),
    ).toBe(false)
  })

  test('root AND combines groups: (A) AND (B)', () => {
    const filter = model('and', [
      group('and', [condition({ field: 'emitterName', operator: 'contains', value: 'Alfa' })]),
      group('and', [condition({ field: 'totalAmount', operator: 'lt', value: '2000' })]),
    ])
    expect(evaluateAdvancedFilter(buildDocument(), filter)).toBe(true)
    expect(evaluateAdvancedFilter(buildDocument({ totalAmount: '2500.0000' }), filter)).toBe(false)
  })

  test('a group with no filled conditions is neutral within a root AND', () => {
    const filter = model('and', [
      group('and', [condition({ field: 'emitterState', operator: 'eq', value: 'SP' })]),
      group('and', [condition({})]),
    ])
    expect(evaluateAdvancedFilter(buildDocument({ emitterState: 'SP' }), filter)).toBe(true)
    expect(evaluateAdvancedFilter(buildDocument({ emitterState: 'MG' }), filter)).toBe(false)
  })

  test('text operators: contains, notContains, eq and neq are case-insensitive', () => {
    const contains = model('and', [
      group('and', [condition({ field: 'emitterName', operator: 'contains', value: 'alfa' })]),
    ])
    const notContains = model('and', [
      group('and', [condition({ field: 'emitterName', operator: 'notContains', value: 'omega' })]),
    ])
    expect(evaluateAdvancedFilter(buildDocument(), contains)).toBe(true)
    expect(evaluateAdvancedFilter(buildDocument(), notContains)).toBe(true)
    expect(
      evaluateAdvancedFilter(buildDocument({ emitterName: 'Omega Logística' }), notContains),
    ).toBe(false)
  })

  test('numeric operators compare number and amount fields numerically', () => {
    const amountBetweenBoundaries = model('and', [
      group('and', [
        condition({ field: 'totalAmount', operator: 'gt', value: '1000' }),
        condition({ field: 'totalAmount', operator: 'lte', value: '1500' }),
        condition({ field: 'number', operator: 'neq', value: '1300' }),
      ]),
    ])
    expect(evaluateAdvancedFilter(buildDocument(), amountBetweenBoundaries)).toBe(true)
    expect(
      evaluateAdvancedFilter(buildDocument({ totalAmount: '900.0000' }), amountBetweenBoundaries),
    ).toBe(false)
  })

  test('date operators between/before/after compare the day portion only', () => {
    const between = model('and', [
      group('and', [
        condition({
          field: 'issuedAt',
          operator: 'between',
          value: '2026-03-01',
          valueTo: '2026-03-31',
        }),
      ]),
    ])
    const before = model('and', [
      group('and', [condition({ field: 'issuedAt', operator: 'before', value: '2026-03-16' })]),
    ])
    const after = model('and', [
      group('and', [condition({ field: 'issuedAt', operator: 'after', value: '2026-03-16' })]),
    ])
    expect(evaluateAdvancedFilter(buildDocument(), between)).toBe(true)
    expect(evaluateAdvancedFilter(buildDocument(), before)).toBe(true)
    expect(evaluateAdvancedFilter(buildDocument(), after)).toBe(false)
    expect(
      evaluateAdvancedFilter(buildDocument({ issuedAt: '2026-05-01T00:00:00.000Z' }), between),
    ).toBe(false)
  })

  test('countActiveConditions only counts conditions that carry a value', () => {
    const filter = model('and', [
      group('and', [
        condition({ field: 'emitterName', operator: 'contains', value: 'Alfa' }),
        condition({ field: 'recipientName', operator: 'contains', value: '' }),
      ]),
      group('or', [
        condition({
          field: 'issuedAt',
          operator: 'between',
          value: '',
          valueTo: '2026-03-31',
        }),
      ]),
    ])
    expect(countActiveConditions(filter)).toBe(2)
  })
})

describe('nfe workspace saved advanced filter as simple-mode pill contract', () => {
  function simpleFilters(overrides: Partial<DocumentFilters> = {}): DocumentFilters {
    return { ...EMPTY_FILTERS, ...overrides }
  }

  const recipientInPr = simpleFilters({
    select: { ...EMPTY_FILTERS.select, recipientState: 'PR' },
  })

  test('no saved advanced filter falls back to plain simple filters', () => {
    expect(documentMatchesSimpleMode(buildDocument(), recipientInPr, null)).toBe(true)
    expect(
      documentMatchesSimpleMode(buildDocument({ recipientState: 'SC' }), recipientInPr, null),
    ).toBe(false)
  })

  test('saved advanced filter is AND-combined with the simple filters', () => {
    const saved = model('and', [
      group('and', [condition({ field: 'totalAmount', operator: 'gte', value: '2000' })]),
    ])
    // Passes simple (PR) but fails saved advanced (amount < 2000) → excluded.
    expect(
      documentMatchesSimpleMode(buildDocument({ totalAmount: '1500.0000' }), recipientInPr, saved),
    ).toBe(false)
    // Passes saved advanced but fails simple (SC ≠ PR) → excluded.
    expect(
      documentMatchesSimpleMode(
        buildDocument({ recipientState: 'SC', totalAmount: '5000.0000' }),
        recipientInPr,
        saved,
      ),
    ).toBe(false)
    // Passes both → included.
    expect(
      documentMatchesSimpleMode(buildDocument({ totalAmount: '5000.0000' }), recipientInPr, saved),
    ).toBe(true)
  })

  test('an internally OR-combined saved filter is treated as a single AND unit', () => {
    const saved = model('or', [
      group('and', [condition({ field: 'emitterState', operator: 'eq', value: 'RJ' })]),
      group('and', [condition({ field: 'totalAmount', operator: 'gte', value: '5000' })]),
    ])
    // simple = PR recipient; saved = (emitterState RJ) OR (amount >= 5000).
    expect(
      documentMatchesSimpleMode(buildDocument({ totalAmount: '9000.0000' }), recipientInPr, saved),
    ).toBe(true)
    expect(
      documentMatchesSimpleMode(buildDocument({ emitterState: 'RJ' }), recipientInPr, saved),
    ).toBe(true)
    // Neither OR branch matches → excluded even though simple (PR) passes.
    expect(
      documentMatchesSimpleMode(
        buildDocument({ emitterState: 'MG', totalAmount: '100.0000' }),
        recipientInPr,
        saved,
      ),
    ).toBe(false)
  })

  test('a saved filter with no filled conditions is neutral', () => {
    const emptySaved = model('and', [group('and', [condition({})])])
    expect(documentMatchesSimpleMode(buildDocument(), EMPTY_FILTERS, emptySaved)).toBe(true)
  })
})

describe('nfe workspace column reorder contract', () => {
  const order: readonly ColumnKey[] = [
    'number',
    'series',
    'emitter',
    'recipient',
    'amount',
    'status',
  ]

  test('moving a column up swaps it with the previous column', () => {
    expect(reorderColumns(order, 'emitter', 'up')).toEqual([
      'number',
      'emitter',
      'series',
      'recipient',
      'amount',
      'status',
    ])
  })

  test('moving a column down swaps it with the next column', () => {
    expect(reorderColumns(order, 'emitter', 'down')).toEqual([
      'number',
      'series',
      'recipient',
      'emitter',
      'amount',
      'status',
    ])
  })

  test('moving the first column up is a no-op returning the same order', () => {
    expect(reorderColumns(order, 'number', 'up')).toEqual(order)
  })

  test('moving the last column down is a no-op returning the same order', () => {
    expect(reorderColumns(order, 'status', 'down')).toEqual(order)
  })

  test('reordering does not mutate the input array', () => {
    const snapshot = [...order]
    reorderColumns(order, 'emitter', 'up')
    expect(order).toEqual(snapshot)
  })
})
