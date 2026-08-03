/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  clearMdfeManifestFilterField,
  describeMdfeManifestFilterPills,
  type MdfeManifestFilterPill,
} from '../../src/modules/mdfe-manifest/shared/mdfeManifestFilterPills.service'
import {
  EMPTY_MDFE_MANIFEST_FILTERS,
  type MdfeManifestTableFilters,
} from '../../src/modules/mdfe-manifest/shared/mdfeManifestTable.service'

function formatDay(value: string): string {
  return value.split('-').reverse().join('/')
}

function buildFilters(overrides: Partial<MdfeManifestTableFilters> = {}): MdfeManifestTableFilters {
  return { ...EMPTY_MDFE_MANIFEST_FILTERS, ...overrides }
}

function describePills(filters: MdfeManifestTableFilters): readonly MdfeManifestFilterPill[] {
  return describeMdfeManifestFilterPills({ filters, formatDay })
}

describe('mdfe manifest filter pills contract', () => {
  test('describes nothing while no manifest filter is applied', () => {
    expect(describePills(buildFilters())).toEqual([])
  })

  test('describes the fiscal number, the cte count range and the creation range', () => {
    const pills = describePills(
      buildFilters({ createdTo: '2026-03-31', cteCountFrom: '5', fiscalNumberContains: '120' }),
    )

    expect(pills.map((pill) => pill.field)).toEqual([
      'fiscalNumberContains',
      'cteCountRange',
      'createdRange',
    ])
    expect(pills[1]?.value).toBe('5–…')
    expect(pills[2]?.value).toBe('…–31/03/2026')
  })

  test('names the statuses by key and the destination states by their own value', () => {
    const pills = describePills(
      buildFilters({ destinationStates: ['PR', 'SP'], statuses: ['authorized'] }),
    )

    expect(pills[0]).toEqual({
      field: 'statuses',
      labelKey: 'filters.status',
      value: '',
      valueKeys: ['status.authorized'],
    })
    expect(pills[1]).toEqual({
      field: 'destinationStates',
      labelKey: 'columns.destinationState',
      value: 'PR, SP',
    })
  })

  test('clears only the target field, and both ends of a range', () => {
    const filters = buildFilters({
      createdFrom: '2026-03-01',
      createdTo: '2026-03-31',
      statuses: ['authorized'],
    })

    expect(clearMdfeManifestFilterField({ field: 'createdRange', filters })).toEqual(
      buildFilters({ statuses: ['authorized'] }),
    )
    expect(clearMdfeManifestFilterField({ field: 'statuses', filters })).toEqual(
      buildFilters({ createdFrom: '2026-03-01', createdTo: '2026-03-31' }),
    )
  })
})
