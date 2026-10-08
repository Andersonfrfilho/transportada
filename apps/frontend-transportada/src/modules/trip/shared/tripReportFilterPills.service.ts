/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  EMPTY_TRIP_REPORT_FILTER_STATE,
  normalizeTripReportAmount,
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
  return { ...state, documentStatuses: empty.documentStatuses }
}
