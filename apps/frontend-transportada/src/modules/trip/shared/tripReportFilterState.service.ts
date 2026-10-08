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
  cteIssued: string
  dateFrom: string
  dateTo: string
  documentStatuses: readonly TripReportRow['documentStatus'][]
  emitterAddress: string
  emitterCity: string
  emitterNames: readonly string[]
  emitterState: string
  emitterTaxIds: readonly string[]
  fiscalStatus: string
  numberFrom: string
  numberTo: string
  recipientAddress: string
  recipientCity: string
  recipientName: string
  recipientStates: readonly string[]
  search: string
  valueAmount: string
  valueOperator: '' | TripReportValueOperator
}>

export const EMPTY_TRIP_REPORT_FILTER_STATE: TripReportFilterState = {
  contractorIds: [],
  cteIssued: '',
  dateFrom: '',
  dateTo: '',
  documentStatuses: [],
  emitterAddress: '',
  emitterCity: '',
  emitterNames: [],
  emitterState: '',
  emitterTaxIds: [],
  fiscalStatus: '',
  numberFrom: '',
  numberTo: '',
  recipientAddress: '',
  recipientCity: '',
  recipientName: '',
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

const DIGITS_PATTERN = /^\d+$/

/** Número de nota que não é só dígitos não vai para a API (ela responderia 400). */
export function normalizeTripReportNumber(raw: string): string | undefined {
  const trimmed = raw.trim()
  return DIGITS_PATTERN.test(trimmed) ? trimmed : undefined
}

function pickText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
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

function buildNfeScopeFilters(state: TripReportFilterState): TripReportFilters {
  const numberFrom = normalizeTripReportNumber(state.numberFrom)
  const numberTo = normalizeTripReportNumber(state.numberTo)
  const emitterAddress = pickText(state.emitterAddress)
  const recipientName = pickText(state.recipientName)
  const recipientAddress = pickText(state.recipientAddress)
  return {
    ...(numberFrom === undefined ? {} : { numberFrom }),
    ...(numberTo === undefined ? {} : { numberTo }),
    ...(state.dateFrom === '' ? {} : { issuedFrom: state.dateFrom }),
    ...(state.dateTo === '' ? {} : { issuedUntil: state.dateTo }),
    ...(state.emitterNames.length === 0 ? {} : { emitterNameIn: state.emitterNames }),
    ...(state.emitterTaxIds.length === 0 ? {} : { emitterTaxIdIn: state.emitterTaxIds }),
    ...(state.emitterCity === '' ? {} : { emitterCityIn: [state.emitterCity] }),
    ...(state.emitterState === '' ? {} : { emitterStateIn: [state.emitterState] }),
    ...(emitterAddress === undefined ? {} : { emitterAddress }),
    ...(recipientName === undefined ? {} : { recipientName }),
    ...(recipientAddress === undefined ? {} : { recipientAddress }),
    ...(state.cteIssued === '' ? {} : { cteIssued: state.cteIssued }),
    ...(state.fiscalStatus === '' ? {} : { fiscalStatusIn: [state.fiscalStatus] }),
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
    ...buildNfeScopeFilters(state),
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
    normalizeTripReportNumber(state.numberFrom) !== undefined ||
      normalizeTripReportNumber(state.numberTo) !== undefined,
    state.dateFrom !== '' || state.dateTo !== '',
    state.emitterNames.length > 0,
    state.emitterTaxIds.length > 0,
    state.emitterCity !== '',
    state.emitterState !== '',
    state.emitterAddress.trim() !== '',
    state.recipientName.trim() !== '',
    state.recipientAddress.trim() !== '',
    state.cteIssued !== '',
    state.fiscalStatus !== '',
  ].filter(Boolean).length
}
