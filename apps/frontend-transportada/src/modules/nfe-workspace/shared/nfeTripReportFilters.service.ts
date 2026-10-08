/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripReportFilters } from '@/modules/trip/shared/tripReport.types'
import { normalizeTripReportAmount } from '@/modules/trip/shared/tripReportFilterState.service'

import {
  MULTI_FILTER_FIELDS,
  TEXT_FILTER_FIELDS,
  type DocumentFilters,
} from '../hooks/useNfeDocumentTable.hook'

/** Filtros da aba que o endpoint do relatório não entende — não há `contractorIdIn` na nota, só o nome do emitente. */
export type NfeTripReportUnsupportedFilter =
  | 'advanced'
  | 'cteIssued'
  | 'date'
  | 'emitter'
  | 'emitterAddress'
  | 'emitterCity'
  | 'emitterState'
  | 'number'
  | 'recipientAddress'
  | 'recipientName'
  | 'status'

export type NfeTripReportTranslationInput = Readonly<{
  filters: DocumentFilters
  isAdvancedActive: boolean
  searchTerm: string
}>

export type NfeTripReportTranslation = Readonly<{
  filters: TripReportFilters
  unsupported: readonly NfeTripReportUnsupportedFilter[]
}>

const UNSUPPORTED_SELECT_FIELDS = ['emitterCity', 'emitterState', 'status', 'cteIssued'] as const

function isFilled(value: string): boolean {
  return value.trim().length > 0
}

function listUnsupportedFilters(
  input: NfeTripReportTranslationInput,
): readonly NfeTripReportUnsupportedFilter[] {
  const { filters } = input
  const unsupported: NfeTripReportUnsupportedFilter[] = []
  if (input.isAdvancedActive) unsupported.push('advanced')
  if (MULTI_FILTER_FIELDS.some((field) => filters.multi[field].length > 0)) {
    unsupported.push('emitter')
  }
  for (const field of TEXT_FILTER_FIELDS) {
    if (isFilled(filters.text[field])) unsupported.push(field)
  }
  for (const field of UNSUPPORTED_SELECT_FIELDS) {
    if (filters.select[field] !== '') unsupported.push(field)
  }
  if (isFilled(filters.numberFrom) || isFilled(filters.numberTo)) unsupported.push('number')
  if (filters.dateFrom !== '' || filters.dateTo !== '') unsupported.push('date')
  return unsupported
}

/** `unlinkedOnly` não entra: o relatório só tem notas em viagem, o oposto do que ele esconde. */
export function translateNfeFiltersToTripReport(
  input: NfeTripReportTranslationInput,
): NfeTripReportTranslation {
  const { filters } = input
  const search = input.searchTerm.trim()
  const amount = normalizeTripReportAmount(filters.amountValue)
  const { recipientCity, recipientState } = filters.select
  return {
    filters: {
      ...(recipientCity === '' ? {} : { recipientCityIn: [recipientCity] }),
      ...(recipientState === '' ? {} : { recipientStateIn: [recipientState] }),
      ...(search === '' ? {} : { search }),
      ...(amount === undefined
        ? {}
        : { valueAmount: amount, valueOperator: filters.amountOperator }),
    },
    unsupported: listUnsupportedFilters(input),
  }
}
