/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  EMPTY_MULTI,
  EMPTY_SELECT,
  EMPTY_TEXT,
} from '@/modules/shared/nfe-filter/nfeFilter.constant'
import type {
  AdvancedFilterModel,
  DocumentFilters,
  MultiFilterField,
  SelectFilterField,
  TextFilterField,
} from '@/modules/shared/nfe-filter/nfeFilter.types'
import type { NfeFilterPanelController } from '@/modules/shared/nfe-filter/NfeFilterPanelController.types'

import type { TripReportFacets } from './tripReport.types'
import type { TripReportFilterState } from './tripReportFilterState.service'

type FilterOptions = Pick<
  NfeFilterPanelController,
  'cityOptions' | 'emitterOptions' | 'stateOptions' | 'textOptions'
>

/** O relatório não esconde nota vinculada nem tem modo avançado nesta entrega. */
export const TRIP_REPORT_FILTER_CAPABILITIES = { advanced: false, unlinkedOnly: false } as const

export const EMPTY_ADVANCED_FILTER: AdvancedFilterModel = { connector: 'and', groups: [] }

const NO_OPTIONS: readonly string[] = []

export const EMPTY_TRIP_REPORT_FILTER_OPTIONS: FilterOptions = {
  cityOptions: { emitterCity: NO_OPTIONS, recipientCity: NO_OPTIONS },
  emitterOptions: { emitterName: NO_OPTIONS, emitterTaxId: NO_OPTIONS },
  stateOptions: { emitterState: NO_OPTIONS, recipientState: NO_OPTIONS },
  textOptions: {
    emitterAddress: NO_OPTIONS,
    recipientAddress: NO_OPTIONS,
    recipientName: NO_OPTIONS,
  },
}

export function buildTripReportFilterOptions(facets: TripReportFacets): FilterOptions {
  return {
    cityOptions: { emitterCity: facets.cities.emitter, recipientCity: facets.cities.recipient },
    emitterOptions: {
      emitterName: [...new Set(facets.emitters.map((emitter) => emitter.name))],
      emitterTaxId: [...new Set(facets.emitters.map((emitter) => emitter.taxId))],
    },
    stateOptions: { emitterState: facets.states.emitter, recipientState: facets.states.recipient },
    textOptions: EMPTY_TRIP_REPORT_FILTER_OPTIONS.textOptions,
  }
}

export function toDocumentFilters(state: TripReportFilterState): DocumentFilters {
  return {
    amountOperator: state.valueOperator === '' ? 'gte' : state.valueOperator,
    amountValue: state.valueAmount,
    dateFrom: state.dateFrom,
    dateTo: state.dateTo,
    multi: { ...EMPTY_MULTI, emitterName: state.emitterNames, emitterTaxId: state.emitterTaxIds },
    numberFrom: state.numberFrom,
    numberTo: state.numberTo,
    select: {
      ...EMPTY_SELECT,
      cteIssued: state.cteIssued,
      emitterCity: state.emitterCity,
      emitterState: state.emitterState,
      recipientCity: state.recipientCity,
      recipientState: state.recipientStates[0] ?? '',
      status: state.fiscalStatus,
    },
    text: {
      ...EMPTY_TEXT,
      emitterAddress: state.emitterAddress,
      recipientAddress: state.recipientAddress,
      recipientName: state.recipientName,
    },
    unlinkedOnly: false,
  }
}

export function applySelectFilter(
  input: Readonly<{ field: SelectFilterField; state: TripReportFilterState; value: string }>,
): TripReportFilterState {
  const { field, state, value } = input
  if (field === 'recipientState') return { ...state, recipientStates: value === '' ? [] : [value] }
  if (field === 'status') return { ...state, fiscalStatus: value }
  return { ...state, [field]: value }
}

export function applyMultiFilter(
  input: Readonly<{
    field: MultiFilterField
    state: TripReportFilterState
    values: readonly string[]
  }>,
): TripReportFilterState {
  const { field, state, values } = input
  return field === 'emitterName'
    ? { ...state, emitterNames: values }
    : { ...state, emitterTaxIds: values }
}

export function applyTextFilter(
  input: Readonly<{ field: TextFilterField; state: TripReportFilterState; value: string }>,
): TripReportFilterState {
  return { ...input.state, [input.field]: input.value }
}

/** Valor sem operador nunca iria à API; o painel mostra `gte` como padrão e o estado precisa dizer o mesmo. */
export function applyAmountValue(
  input: Readonly<{ state: TripReportFilterState; value: string }>,
): TripReportFilterState {
  const { state, value } = input
  return {
    ...state,
    valueAmount: value,
    valueOperator: state.valueOperator === '' ? 'gte' : state.valueOperator,
  }
}
