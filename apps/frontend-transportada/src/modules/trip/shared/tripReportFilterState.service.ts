/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripFilters } from './trip.types'
import type { TripReportFilters, TripReportRow, TripReportValueOperator } from './tripReport.types'

export const TRIP_REPORT_NO_CONTRACTOR_MARKER = 'none'

export const TRIP_REPORT_VALUE_OPERATORS: readonly TripReportValueOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
]

export const TRIP_REPORT_VALUE_OPERATOR_SYMBOL: Readonly<Record<TripReportValueOperator, string>> =
  { eq: '=', gt: '>', gte: '≥', lt: '<', lte: '≤', neq: '≠' }

export const TRIP_REPORT_DOCUMENT_STATUSES: readonly TripReportRow['documentStatus'][] = [
  'pending',
  'separated',
  'loaded',
  'delivered',
  'returned',
]

export const TRIP_REPORT_STATE_ACRONYMS: readonly string[] = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const // prettier-ignore

export type TripReportFilterState = Readonly<{
  contractorIds: readonly string[]
  documentStatuses: readonly TripReportRow['documentStatus'][]
  recipientCity: string
  recipientStates: readonly string[]
  search: string
  valueAmount: string
  valueOperator: '' | TripReportValueOperator
}>

export const EMPTY_TRIP_REPORT_FILTER_STATE: TripReportFilterState = {
  contractorIds: [],
  documentStatuses: [],
  recipientCity: '',
  recipientStates: [],
  search: '',
  valueAmount: '',
  valueOperator: '',
}

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

/** Aceita vírgula decimal; o que não é dinheiro válido não vai para a API (ela responderia 400). */
export function normalizeTripReportAmount(raw: string): string | undefined {
  const normalized = raw.trim().replace(',', '.')
  return AMOUNT_PATTERN.test(normalized) ? normalized : undefined
}

function isValueComplete(state: TripReportFilterState): boolean {
  return state.valueOperator !== '' && normalizeTripReportAmount(state.valueAmount) !== undefined
}

/** Só os filtros da listagem que a API de relatório também entende — o escopo segue a tela. */
function pickTripScope(tripFilters: TripFilters): TripReportFilters {
  return {
    ...(tripFilters.createdFrom === undefined ? {} : { createdFrom: tripFilters.createdFrom }),
    ...(tripFilters.createdUntil === undefined ? {} : { createdUntil: tripFilters.createdUntil }),
    ...(tripFilters.driverIdIn === undefined ? {} : { driverIdIn: tripFilters.driverIdIn }),
    ...(tripFilters.proofPendingEq === undefined
      ? {}
      : { proofPendingEq: tripFilters.proofPendingEq }),
    ...(tripFilters.statusIn === undefined ? {} : { statusIn: tripFilters.statusIn }),
    ...(tripFilters.vehicleIdIn === undefined ? {} : { vehicleIdIn: tripFilters.vehicleIdIn }),
  }
}

export function buildTripReportFilters(
  input: Readonly<{ state: TripReportFilterState; tripFilters: TripFilters }>,
): TripReportFilters {
  const { state } = input
  const amount = normalizeTripReportAmount(state.valueAmount)
  const search = state.search.trim()
  return {
    ...pickTripScope(input.tripFilters),
    ...(state.contractorIds.length === 0 ? {} : { contractorIdIn: state.contractorIds }),
    ...(state.documentStatuses.length === 0 ? {} : { documentStatusIn: state.documentStatuses }),
    ...(state.recipientCity === '' ? {} : { recipientCityIn: [state.recipientCity] }),
    ...(state.recipientStates.length === 0 ? {} : { recipientStateIn: state.recipientStates }),
    ...(search === '' ? {} : { search }),
    ...(isValueComplete(state) && state.valueOperator !== '' && amount !== undefined
      ? { valueAmount: amount, valueOperator: state.valueOperator }
      : {}),
  }
}

export function countActiveTripReportFilters(state: TripReportFilterState): number {
  return [
    state.contractorIds.length > 0,
    state.documentStatuses.length > 0,
    state.recipientCity !== '',
    state.recipientStates.length > 0,
    state.search.trim() !== '',
    isValueComplete(state),
  ].filter(Boolean).length
}
