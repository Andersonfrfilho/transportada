/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  clearCteBatchFilterField,
  describeCteBatchFilterPills,
  type CteBatchFilterPill,
} from '../../src/modules/cte-batch/shared/cteBatchFilterPills.service'
import {
  clearCteItemFilterField,
  describeCteItemFilterPills,
  type CteItemFilterPill,
} from '../../src/modules/cte-batch/shared/cteItemFilterPills.service'
import {
  EMPTY_CTE_BATCH_FILTERS,
  type CteBatchTableFilters,
} from '../../src/modules/cte-batch/shared/cteBatchTable.service'
import {
  EMPTY_CTE_ITEM_FILTERS,
  type CteItemTableFilters,
} from '../../src/modules/cte-batch/shared/cteBatchItemTable.service'

function formatDay(value: string): string {
  return value.split('-').reverse().join('/')
}

function buildBatchFilters(overrides: Partial<CteBatchTableFilters> = {}): CteBatchTableFilters {
  return { ...EMPTY_CTE_BATCH_FILTERS, ...overrides }
}

function buildItemFilters(overrides: Partial<CteItemTableFilters> = {}): CteItemTableFilters {
  return { ...EMPTY_CTE_ITEM_FILTERS, ...overrides }
}

function describeBatch(filters: CteBatchTableFilters): readonly CteBatchFilterPill[] {
  return describeCteBatchFilterPills({ filters, formatDay })
}

function describeItem(filters: CteItemTableFilters): readonly CteItemFilterPill[] {
  return describeCteItemFilterPills({ filters, formatDay })
}

describe('cte batch filter pills contract', () => {
  test('describes nothing while the batch filters are untouched', () => {
    expect(describeBatch(buildBatchFilters())).toEqual([])
  })

  test('describes the batch name, the item count range and the creation range', () => {
    const pills = describeBatch(
      buildBatchFilters({ createdFrom: '2026-03-01', itemCountFrom: '10', nameContains: 'março' }),
    )

    expect(pills.map((pill) => pill.field)).toEqual([
      'nameContains',
      'itemCountRange',
      'createdRange',
    ])
    expect(pills[1]?.value).toBe('10–…')
    expect(pills[2]?.value).toBe('01/03/2026–…')
  })

  test('lists the selected batch statuses by key, and stays quiet on the default', () => {
    expect(describeBatch(buildBatchFilters({ statuses: [] }))).toEqual([])

    const pills = describeBatch(buildBatchFilters({ statuses: ['draft', 'submitted'] }))
    expect(pills[0]).toEqual({
      field: 'statuses',
      labelKey: 'filters.status',
      value: '',
      valueKeys: ['status.draft', 'status.submitted'],
    })
  })

  test('clears only the target batch field, and both ends of a range', () => {
    const filters = buildBatchFilters({
      createdFrom: '2026-03-01',
      createdTo: '2026-03-31',
      nameContains: 'março',
    })

    expect(clearCteBatchFilterField({ field: 'createdRange', filters })).toEqual(
      buildBatchFilters({ nameContains: 'março' }),
    )
    expect(clearCteBatchFilterField({ field: 'statuses', filters })).toEqual(filters)
  })
})

describe('cte item filter pills contract', () => {
  test('describes nothing while the item filters sit on their defaults', () => {
    expect(describeItem(buildItemFilters())).toEqual([])
  })

  test('describes the number queries and the issue range', () => {
    const pills = describeItem(
      buildItemFilters({ cteNumberQuery: '3, 7, 10-40', issuedTo: '2026-03-31' }),
    )

    expect(pills.map((pill) => pill.field)).toEqual(['cteNumberQuery', 'issuedRange'])
    expect(pills[0]?.value).toBe('3, 7, 10-40')
    expect(pills[1]?.value).toBe('…–31/03/2026')
  })

  /** O default esconde status: só vira pílula quando a escolha sai dele, para os dois lados. */
  test('describes the statuses only when the selection leaves the default', () => {
    expect(describeItem(buildItemFilters({ statuses: EMPTY_CTE_ITEM_FILTERS.statuses }))).toEqual(
      [],
    )

    const pills = describeItem(buildItemFilters({ statuses: ['authorized'] }))
    expect(pills[0]?.field).toBe('statuses')
    expect(pills[0]?.valueKeys).toEqual(['itemStatus.authorized'])
  })

  test('clears a field back to its default instead of to an empty selection', () => {
    const filters = buildItemFilters({ cteNumberQuery: '12', statuses: ['authorized'] })

    expect(clearCteItemFilterField({ field: 'statuses', filters })).toEqual(
      buildItemFilters({ cteNumberQuery: '12' }),
    )
    expect(clearCteItemFilterField({ field: 'cteNumberQuery', filters })).toEqual(
      buildItemFilters({ statuses: ['authorized'] }),
    )
  })
})
