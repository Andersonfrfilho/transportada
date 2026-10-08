import { useState } from 'react'

import type { NfeFilterPanelController } from '@/modules/shared/nfe-filter/NfeFilterPanelController.types'

import { useTripReportFacetsQuery } from '../queries/useTripReportFacets.query'
import type { TripReportFetchFacets } from '../shared/tripReport.types'
import {
  applyAmountValue,
  applyMultiFilter,
  applySelectFilter,
  applyTextFilter,
  buildTripReportFilterOptions,
  EMPTY_ADVANCED_FILTER,
  EMPTY_TRIP_REPORT_FILTER_OPTIONS,
  toDocumentFilters,
  TRIP_REPORT_FILTER_CAPABILITIES,
} from '../shared/tripReportFilterController.service'
import {
  clearTripReportFilterField,
  type TripReportPillField,
} from '../shared/tripReportFilterPills.service'
import {
  countActiveTripReportFilters,
  EMPTY_TRIP_REPORT_FILTER_STATE,
  type TripReportFilterState,
} from '../shared/tripReportFilterState.service'

export type TripReportFiltersController = NfeFilterPanelController &
  Readonly<{
    activeCount: number
    clear: () => void
    clearField: (field: TripReportPillField) => void
    setField: <TKey extends keyof TripReportFilterState>(
      key: TKey,
      value: TripReportFilterState[TKey],
    ) => void
    state: TripReportFilterState
  }>

function doNothing(): void {
  return undefined
}

/** Escopo só do relatório: nada aqui entra na consulta da listagem de viagens. */
export function useTripReportFilters(
  input: Readonly<{ fetchFacets?: TripReportFetchFacets }> = {},
): TripReportFiltersController {
  const [state, setState] = useState<TripReportFilterState>(EMPTY_TRIP_REPORT_FILTER_STATE)
  const facets = useTripReportFacetsQuery(input)
  const options =
    facets === undefined ? EMPTY_TRIP_REPORT_FILTER_OPTIONS : buildTripReportFilterOptions(facets)

  return {
    ...options,
    activeConditionCount: 0,
    activeCount: countActiveTripReportFilters(state),
    addCondition: doNothing,
    addGroup: doNothing,
    advancedFilter: EMPTY_ADVANCED_FILTER,
    capabilities: TRIP_REPORT_FILTER_CAPABILITIES,
    clear: () => setState(EMPTY_TRIP_REPORT_FILTER_STATE),
    clearConditions: doNothing,
    clearField: (field) =>
      setState((current) => clearTripReportFilterField({ field, state: current })),
    filters: toDocumentFilters(state),
    mode: 'simple',
    removeCondition: doNothing,
    removeGroup: doNothing,
    saveAdvancedFilter: doNothing,
    setAmountOperator: (operator) =>
      setState((current) => ({ ...current, valueOperator: operator })),
    setAmountValue: (value) => setState((current) => applyAmountValue({ state: current, value })),
    setDateRange: (from, to) => setState((current) => ({ ...current, dateFrom: from, dateTo: to })),
    setField: (key, value) => setState((current) => ({ ...current, [key]: value })),
    setGroupConnector: doNothing,
    setMode: doNothing,
    setMultiFilter: (field, values) =>
      setState((current) => applyMultiFilter({ field, state: current, values })),
    setNumberFrom: (value) => setState((current) => ({ ...current, numberFrom: value })),
    setNumberTo: (value) => setState((current) => ({ ...current, numberTo: value })),
    setRootConnector: doNothing,
    setSelectFilter: (field, value) =>
      setState((current) => applySelectFilter({ field, state: current, value })),
    setTextFilter: (field, value) =>
      setState((current) => applyTextFilter({ field, state: current, value })),
    setUnlinkedOnly: doNothing,
    state,
    updateCondition: doNothing,
  }
}
