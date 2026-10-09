/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { act } from 'react'

import { useTripReportFilters } from '@/modules/trip/hooks/useTripReportFilters.hook'
import { describeTripReportFilterPills } from '@/modules/trip/shared/tripReportFilterPills.service'
import {
  buildTripReportFilters,
  TRIP_REPORT_NO_CONTRACTOR_MARKER,
} from '@/modules/trip/shared/tripReportFilterState.service'
import { buildTripReportSearch } from '@/modules/trip/shared/tripReportClient.service'

import { renderHook } from './renderHook.helper'

describe('trip report filters', () => {
  test('starts empty and converts to no report filters', async () => {
    const hook = await renderHook(useTripReportFilters)
    expect(hook.result().activeCount).toBe(0)
    expect(buildTripReportFilters({ state: hook.result().state, tripFilters: {} })).toEqual({})
    hook.unmount()
  })

  test('sets every filter, counts it and converts to TripReportFilters', async () => {
    const hook = await renderHook(useTripReportFilters)
    act(() => {
      hook.result().setField('search', ' 123 ')
      hook.result().setField('contractorIds', ['c1', TRIP_REPORT_NO_CONTRACTOR_MARKER])
      hook.result().setField('recipientCity', 'Recife')
      hook.result().setField('recipientStates', ['PE'])
      hook.result().setField('valueOperator', 'gte')
      hook.result().setField('valueAmount', '10,5')
      hook.result().setField('documentStatuses', ['delivered'])
    })
    expect(hook.result().activeCount).toBe(6)
    const filters = buildTripReportFilters({
      state: hook.result().state,
      tripFilters: { statusIn: ['in_transit'] as never, proofPendingEq: true },
    })
    expect(filters).toEqual({
      contractorIdIn: ['c1', 'none'],
      documentStatusIn: ['delivered'],
      proofPendingEq: true,
      recipientCityIn: ['Recife'],
      recipientStateIn: ['PE'],
      search: '123',
      statusIn: ['in_transit'],
      valueAmount: '10.5',
      valueOperator: 'gte',
    })
    const params = new URLSearchParams(buildTripReportSearch({ cursor: null, filters, limit: 100 }))
    expect(params.get('contractorIdIn')).toBe('c1,none')
    expect(params.get('valueOperator')).toBe('gte')
    hook.unmount()
  })

  test('incomplete value (operator without amount, or the opposite) is not sent', async () => {
    const hook = await renderHook(useTripReportFilters)
    act(() => hook.result().setField('valueOperator', 'gt'))
    expect(buildTripReportFilters({ state: hook.result().state, tripFilters: {} })).toEqual({})
    expect(hook.result().activeCount).toBe(0)
    act(() => {
      hook.result().setField('valueOperator', '')
      hook.result().setField('valueAmount', '9')
    })
    expect(buildTripReportFilters({ state: hook.result().state, tripFilters: {} })).toEqual({})
    act(() => {
      hook.result().setField('valueOperator', 'lt')
      hook.result().setField('valueAmount', 'abc')
    })
    expect(buildTripReportFilters({ state: hook.result().state, tripFilters: {} })).toEqual({})
    hook.unmount()
  })

  test('pills describe each filter, remove one by field and clear all', async () => {
    const hook = await renderHook(useTripReportFilters)
    act(() => {
      hook.result().setField('contractorIds', ['c1', 'none'])
      hook.result().setField('valueOperator', 'lte')
      hook.result().setField('valueAmount', '5')
      hook.result().setField('documentStatuses', ['returned'])
    })
    const pills = describeTripReportFilterPills({
      describeContractor: (id) => `Name ${id}`,
      noContractorLabel: 'No registration',
      state: hook.result().state,
    })
    expect(pills.map((pill) => pill.field)).toEqual(['contractorIds', 'value', 'documentStatuses'])
    expect(pills[0]?.value).toBe('Name c1, No registration')
    expect(pills[1]?.value).toBe('≤ 5')
    act(() => hook.result().clearField('value'))
    expect(hook.result().state.valueOperator).toBe('')
    expect(hook.result().activeCount).toBe(2)
    act(() => hook.result().clear())
    expect(hook.result().activeCount).toBe(0)
    hook.unmount()
  })
  test('marks the open side of a number and date range like the notes tab does', async () => {
    const hook = await renderHook(useTripReportFilters)
    act(() => {
      hook.result().setField('numberFrom', '100')
      hook.result().setField('dateTo', '2026-03-01')
    })
    const pills = describeTripReportFilterPills({
      describeContractor: (id) => id,
      formatDay: (day) => day,
      noContractorLabel: 'No registration',
      state: hook.result().state,
    })
    expect(pills.find((pill) => pill.field === 'number')?.value).toBe('100–…')
    expect(pills.find((pill) => pill.field === 'date')?.value).toBe('… – 2026-03-01')
    hook.unmount()
  })
})
