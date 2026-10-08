/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { act } from 'react'

import {
  useTripReportFilters,
  type TripReportFiltersController,
} from '@/modules/trip/hooks/useTripReportFilters.hook'
import type { TripReportFacets, TripReportFilters } from '@/modules/trip/shared/tripReport.types'
import { buildTripReportSearch } from '@/modules/trip/shared/tripReportClient.service'
import { describeTripReportFilterPills } from '@/modules/trip/shared/tripReportFilterPills.service'
import { buildTripReportFilters } from '@/modules/trip/shared/tripReportFilterState.service'

import { renderHook, waitFor } from './renderHook.helper'

const FACETS: TripReportFacets = {
  cities: { emitter: ['Recife'], recipient: ['Olinda', 'Recife'] },
  emitters: [
    { name: 'Acme', taxId: '111' },
    { name: 'Acme', taxId: '222' },
  ],
  states: { emitter: ['PE'], recipient: ['PE', 'SP'] },
}

const CONTROLLER_MEMBERS = [
  'activeConditionCount',
  'addCondition',
  'addGroup',
  'advancedFilter',
  'capabilities',
  'cityOptions',
  'clearConditions',
  'emitterOptions',
  'filters',
  'mode',
  'removeCondition',
  'removeGroup',
  'saveAdvancedFilter',
  'setAmountOperator',
  'setAmountValue',
  'setDateRange',
  'setGroupConnector',
  'setMode',
  'setMultiFilter',
  'setNumberFrom',
  'setNumberTo',
  'setRootConnector',
  'setSelectFilter',
  'setTextFilter',
  'setUnlinkedOnly',
  'stateOptions',
  'textOptions',
  'updateCondition',
] as const

type SetterCase = Readonly<{
  apply: (controller: TripReportFiltersController) => void
  expected: TripReportFilters
  name: string
}>

const SETTER_CASES: readonly SetterCase[] = [
  { apply: (c) => c.setNumberFrom('10'), expected: { numberFrom: '10' }, name: 'numberFrom' },
  { apply: (c) => c.setNumberTo('20'), expected: { numberTo: '20' }, name: 'numberTo' },
  {
    apply: (c) => c.setDateRange('2026-01-01', '2026-01-31'),
    expected: { issuedFrom: '2026-01-01', issuedUntil: '2026-01-31' },
    name: 'dateRange',
  },
  {
    apply: (c) => c.setMultiFilter('emitterName', ['Acme', 'Beta']),
    expected: { emitterNameIn: ['Acme', 'Beta'] },
    name: 'emitterName',
  },
  {
    apply: (c) => c.setMultiFilter('emitterTaxId', ['111']),
    expected: { emitterTaxIdIn: ['111'] },
    name: 'emitterTaxId',
  },
  {
    apply: (c) => c.setSelectFilter('emitterCity', 'Recife'),
    expected: { emitterCityIn: ['Recife'] },
    name: 'emitterCity',
  },
  {
    apply: (c) => c.setSelectFilter('emitterState', 'PE'),
    expected: { emitterStateIn: ['PE'] },
    name: 'emitterState',
  },
  {
    apply: (c) => c.setSelectFilter('recipientCity', 'Olinda'),
    expected: { recipientCityIn: ['Olinda'] },
    name: 'recipientCity',
  },
  {
    apply: (c) => c.setSelectFilter('recipientState', 'SP'),
    expected: { recipientStateIn: ['SP'] },
    name: 'recipientState',
  },
  {
    apply: (c) => c.setSelectFilter('status', 'cancelled'),
    expected: { fiscalStatusIn: ['cancelled'] },
    name: 'status',
  },
  {
    apply: (c) => c.setSelectFilter('cteIssued', 'pending'),
    expected: { cteIssued: 'pending' },
    name: 'cteIssued',
  },
  {
    apply: (c) => c.setTextFilter('emitterAddress', ' Rua A '),
    expected: { emitterAddress: 'Rua A' },
    name: 'emitterAddress',
  },
  {
    apply: (c) => c.setTextFilter('recipientName', 'Maria'),
    expected: { recipientName: 'Maria' },
    name: 'recipientName',
  },
  {
    apply: (c) => c.setTextFilter('recipientAddress', 'Rua B'),
    expected: { recipientAddress: 'Rua B' },
    name: 'recipientAddress',
  },
  {
    apply: (c) => {
      c.setAmountOperator('lt')
      c.setAmountValue('7,5')
    },
    expected: { valueAmount: '7.5', valueOperator: 'lt' },
    name: 'amount',
  },
]

describe('trip report filters as the shared panel controller', () => {
  test('exposes the 28 panel members and the report capabilities', async () => {
    const hook = await renderHook(useTripReportFilters)
    const controller = hook.result()
    for (const member of CONTROLLER_MEMBERS) expect(member in controller).toBe(true)
    expect(controller.capabilities).toEqual({ advanced: false, unlinkedOnly: false })
    expect(controller.mode).toBe('simple')
    expect(controller.filters.unlinkedOnly).toBe(false)
    hook.unmount()
  })

  for (const setterCase of SETTER_CASES) {
    test(`${setterCase.name} reaches the HTTP parameters and the pills`, async () => {
      const hook = await renderHook(useTripReportFilters)
      act(() => setterCase.apply(hook.result()))
      const filters = buildTripReportFilters({ state: hook.result().state, tripFilters: {} })
      expect(filters).toEqual(setterCase.expected)
      expect(hook.result().activeCount).toBe(1)
      const pills = describeTripReportFilterPills({
        describeContractor: (id) => id,
        noContractorLabel: 'none',
        state: hook.result().state,
      })
      expect(pills).toHaveLength(1)
      act(() => hook.result().clearField(pills[0]?.field ?? 'search'))
      expect(buildTripReportFilters({ state: hook.result().state, tripFilters: {} })).toEqual({})
      hook.unmount()
    })
  }

  test('lists go on the wire as CSV and the date range keeps the report field names', async () => {
    const hook = await renderHook(useTripReportFilters)
    act(() => {
      hook.result().setMultiFilter('emitterName', ['Acme', 'Beta'])
      hook.result().setDateRange('2026-01-01', '2026-01-31')
      hook.result().setSelectFilter('status', 'denied')
    })
    expect(hook.result().state.dateFrom).toBe('2026-01-01')
    const filters = buildTripReportFilters({ state: hook.result().state, tripFilters: {} })
    const params = new URLSearchParams(buildTripReportSearch({ cursor: null, filters, limit: 10 }))
    expect(params.get('emitterNameIn')).toBe('Acme,Beta')
    expect(params.get('issuedFrom')).toBe('2026-01-01')
    expect(params.get('issuedUntil')).toBe('2026-01-31')
    expect(params.get('fiscalStatusIn')).toBe('denied')
    expect(params.has('dateFrom')).toBe(false)
    hook.unmount()
  })

  test('number that is not digits is neither counted nor sent', async () => {
    const hook = await renderHook(useTripReportFilters)
    act(() => hook.result().setNumberFrom('12a'))
    expect(hook.result().activeCount).toBe(0)
    expect(buildTripReportFilters({ state: hook.result().state, tripFilters: {} })).toEqual({})
    hook.unmount()
  })

  test('the starting state shows no pill, not even the unlinked-only one', async () => {
    const hook = await renderHook(useTripReportFilters)
    const pills = describeTripReportFilterPills({
      describeContractor: (id) => id,
      noContractorLabel: 'none',
      state: hook.result().state,
    })
    expect(pills).toEqual([])
    act(() => hook.result().setUnlinkedOnly(true))
    expect(hook.result().filters.unlinkedOnly).toBe(false)
    hook.unmount()
  })

  test('options come from the facets endpoint', async () => {
    const hook = await renderHook(() =>
      useTripReportFilters({ fetchFacets: () => Promise.resolve(FACETS) }),
    )
    expect(hook.result().cityOptions.emitterCity).toEqual([])
    await waitFor(() => expect(hook.result().cityOptions.emitterCity).toEqual(['Recife']))
    expect(hook.result().cityOptions.recipientCity).toEqual(['Olinda', 'Recife'])
    expect(hook.result().stateOptions.recipientState).toEqual(['PE', 'SP'])
    expect(hook.result().emitterOptions.emitterName).toEqual(['Acme'])
    expect(hook.result().emitterOptions.emitterTaxId).toEqual(['111', '222'])
    hook.unmount()
  })
})
