import { useState } from 'react'

import {
  clearTripReportFilterField,
  type TripReportPillField,
} from '../shared/tripReportFilterPills.service'
import {
  countActiveTripReportFilters,
  EMPTY_TRIP_REPORT_FILTER_STATE,
  type TripReportFilterState,
} from '../shared/tripReportFilterState.service'

export type TripReportFiltersController = ReturnType<typeof useTripReportFilters>

/** Escopo só do relatório: nada aqui entra na consulta da listagem de viagens. */
export function useTripReportFilters() {
  const [state, setState] = useState<TripReportFilterState>(EMPTY_TRIP_REPORT_FILTER_STATE)

  return {
    activeCount: countActiveTripReportFilters(state),
    clear: () => setState(EMPTY_TRIP_REPORT_FILTER_STATE),
    clearField: (field: TripReportPillField) =>
      setState((current) => clearTripReportFilterField({ field, state: current })),
    setField: <TKey extends keyof TripReportFilterState>(
      key: TKey,
      value: TripReportFilterState[TKey],
    ) => setState((current) => ({ ...current, [key]: value })),
    state,
  }
}
