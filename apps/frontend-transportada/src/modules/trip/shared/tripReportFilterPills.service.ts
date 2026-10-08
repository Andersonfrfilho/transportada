/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  EMPTY_TRIP_REPORT_FILTER_STATE,
  normalizeTripReportAmount,
  normalizeTripReportNumber,
  TRIP_REPORT_NO_CONTRACTOR_MARKER,
  TRIP_REPORT_VALUE_OPERATOR_SYMBOL,
  type TripReportFilterState,
} from './tripReportFilterState.service'

export const TRIP_REPORT_PILL_FIELDS = [
  'search',
  'contractorIds',
  'recipientCity',
  'recipientStates',
  'value',
  'documentStatuses',
  'number',
  'date',
  'emitterNames',
  'emitterTaxIds',
  'emitterCity',
  'emitterState',
  'emitterAddress',
  'recipientName',
  'recipientAddress',
  'cteIssued',
  'fiscalStatus',
] as const
export type TripReportPillField = (typeof TRIP_REPORT_PILL_FIELDS)[number]

export type TripReportFilterPill = Readonly<{
  field: TripReportPillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

type DescribeReportPillsInput = Readonly<{
  describeContractor: (contractorId: string) => string
  formatDay?: (day: string) => string
  noContractorLabel: string
  state: TripReportFilterState
}>

export function describeTripReportFilterPills(
  input: DescribeReportPillsInput,
): readonly TripReportFilterPill[] {
  const { state } = input
  const pills: TripReportFilterPill[] = []
  const search = state.search.trim()
  if (search !== '')
    pills.push({ field: 'search', labelKey: 'filters.report.search', value: search })
  if (state.contractorIds.length > 0) {
    const names = state.contractorIds.map((id) =>
      id === TRIP_REPORT_NO_CONTRACTOR_MARKER
        ? input.noContractorLabel
        : input.describeContractor(id),
    )
    pills.push({
      field: 'contractorIds',
      labelKey: 'filters.report.contractor',
      value: names.join(', '),
    })
  }
  if (state.recipientCity !== '') {
    pills.push({
      field: 'recipientCity',
      labelKey: 'filters.report.recipientCity',
      value: state.recipientCity,
    })
  }
  if (state.recipientStates.length > 0) {
    pills.push({
      field: 'recipientStates',
      labelKey: 'filters.report.recipientState',
      value: state.recipientStates.join(', '),
    })
  }
  const amount = normalizeTripReportAmount(state.valueAmount)
  if (state.valueOperator !== '' && amount !== undefined) {
    pills.push({
      field: 'value',
      labelKey: 'filters.report.value',
      value: `${TRIP_REPORT_VALUE_OPERATOR_SYMBOL[state.valueOperator]} ${amount}`,
    })
  }
  if (state.documentStatuses.length > 0) {
    pills.push({
      field: 'documentStatuses',
      labelKey: 'filters.report.documentStatus',
      value: '',
      valueKeys: state.documentStatuses.map(
        (status) => `filters.report.documentStatuses.${status}`,
      ),
    })
  }
  pills.push(...describeNfePills({ formatDay: input.formatDay ?? ((day) => day), state }))
  return pills
}

const TEXT_PILLS = [
  ['emitterAddress', 'filters.report.emitterAddress'],
  ['recipientName', 'filters.report.recipientName'],
  ['recipientAddress', 'filters.report.recipientAddress'],
] as const

function describeNfePills(
  input: Readonly<{ formatDay: (day: string) => string; state: TripReportFilterState }>,
): readonly TripReportFilterPill[] {
  const { formatDay, state } = input
  const pills: TripReportFilterPill[] = []
  const numberFrom = normalizeTripReportNumber(state.numberFrom)
  const numberTo = normalizeTripReportNumber(state.numberTo)
  if (numberFrom !== undefined || numberTo !== undefined) {
    pills.push({
      field: 'number',
      labelKey: 'filters.report.number',
      value: `${numberFrom ?? ''} – ${numberTo ?? ''}`,
    })
  }
  if (state.dateFrom !== '' || state.dateTo !== '') {
    const from = state.dateFrom === '' ? '' : formatDay(state.dateFrom)
    const to = state.dateTo === '' ? '' : formatDay(state.dateTo)
    pills.push({ field: 'date', labelKey: 'filters.report.issuedAt', value: `${from} – ${to}` })
  }
  if (state.emitterNames.length > 0) {
    pills.push({
      field: 'emitterNames',
      labelKey: 'filters.report.emitterName',
      value: state.emitterNames.join(', '),
    })
  }
  if (state.emitterTaxIds.length > 0) {
    pills.push({
      field: 'emitterTaxIds',
      labelKey: 'filters.report.emitterTaxId',
      value: state.emitterTaxIds.join(', '),
    })
  }
  if (state.emitterCity !== '') {
    pills.push({
      field: 'emitterCity',
      labelKey: 'filters.report.emitterCity',
      value: state.emitterCity,
    })
  }
  if (state.emitterState !== '') {
    pills.push({
      field: 'emitterState',
      labelKey: 'filters.report.emitterState',
      value: state.emitterState,
    })
  }
  for (const [field, labelKey] of TEXT_PILLS) {
    const text = state[field].trim()
    if (text !== '') pills.push({ field, labelKey, value: text })
  }
  if (state.cteIssued !== '') {
    pills.push({
      field: 'cteIssued',
      labelKey: 'filters.report.cteIssued',
      value: '',
      valueKeys: [`filters.report.cteIssuedValues.${state.cteIssued}`],
    })
  }
  if (state.fiscalStatus !== '') {
    pills.push({
      field: 'fiscalStatus',
      labelKey: 'filters.report.fiscalStatus',
      value: '',
      valueKeys: [`filters.report.fiscalStatuses.${state.fiscalStatus}`],
    })
  }
  return pills
}

export function clearTripReportFilterField(
  input: Readonly<{ field: TripReportPillField; state: TripReportFilterState }>,
): TripReportFilterState {
  const empty = EMPTY_TRIP_REPORT_FILTER_STATE
  const { field, state } = input
  if (field === 'value') return { ...state, valueAmount: '', valueOperator: '' }
  if (field === 'search') return { ...state, search: empty.search }
  if (field === 'contractorIds') return { ...state, contractorIds: empty.contractorIds }
  if (field === 'recipientCity') return { ...state, recipientCity: '' }
  if (field === 'recipientStates') return { ...state, recipientStates: empty.recipientStates }
  if (field === 'documentStatuses') return { ...state, documentStatuses: empty.documentStatuses }
  return clearNfeField({ field, state })
}

function clearNfeField(
  input: Readonly<{ field: TripReportPillField; state: TripReportFilterState }>,
): TripReportFilterState {
  const { field, state } = input
  if (field === 'number') return { ...state, numberFrom: '', numberTo: '' }
  if (field === 'date') return { ...state, dateFrom: '', dateTo: '' }
  if (field === 'emitterNames') return { ...state, emitterNames: [] }
  if (field === 'emitterTaxIds') return { ...state, emitterTaxIds: [] }
  if (field === 'emitterCity') return { ...state, emitterCity: '' }
  if (field === 'emitterState') return { ...state, emitterState: '' }
  if (field === 'emitterAddress') return { ...state, emitterAddress: '' }
  if (field === 'recipientName') return { ...state, recipientName: '' }
  if (field === 'recipientAddress') return { ...state, recipientAddress: '' }
  if (field === 'cteIssued') return { ...state, cteIssued: '' }
  return { ...state, fiscalStatus: '' }
}
