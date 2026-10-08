/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripReportFilters } from '@/modules/trip/shared/tripReport.types'
import {
  normalizeTripReportAmount,
  normalizeTripReportNumber,
} from '@/modules/trip/shared/tripReportFilterState.service'

import type { DocumentFilters } from '../hooks/useNfeDocumentTable.hook'

/** O modo avançado é uma árvore de condições; o endpoint do relatório só entende os filtros simples. */
export type NfeTripReportUnsupportedFilter = 'advanced'

export type NfeTripReportTranslationInput = Readonly<{
  filters: DocumentFilters
  isAdvancedActive: boolean
  searchTerm: string
}>

export type NfeTripReportTranslation = Readonly<{
  filters: TripReportFilters
  unsupported: readonly NfeTripReportUnsupportedFilter[]
}>

function pickText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function buildTextFilters(filters: DocumentFilters, searchTerm: string): TripReportFilters {
  const search = pickText(searchTerm)
  const { emitterAddress, recipientAddress, recipientName } = filters.text
  const emitterAddressText = pickText(emitterAddress)
  const recipientAddressText = pickText(recipientAddress)
  const recipientNameText = pickText(recipientName)
  return {
    ...(emitterAddressText === undefined ? {} : { emitterAddress: emitterAddressText }),
    ...(recipientAddressText === undefined ? {} : { recipientAddress: recipientAddressText }),
    ...(recipientNameText === undefined ? {} : { recipientName: recipientNameText }),
    ...(search === undefined ? {} : { search }),
  }
}

function buildListFilters(filters: DocumentFilters): TripReportFilters {
  const { cteIssued, emitterCity, emitterState, recipientCity, recipientState, status } =
    filters.select
  const { emitterName, emitterTaxId } = filters.multi
  return {
    ...(cteIssued === '' ? {} : { cteIssued }),
    ...(emitterCity === '' ? {} : { emitterCityIn: [emitterCity] }),
    ...(emitterName.length === 0 ? {} : { emitterNameIn: emitterName }),
    ...(emitterState === '' ? {} : { emitterStateIn: [emitterState] }),
    ...(emitterTaxId.length === 0 ? {} : { emitterTaxIdIn: emitterTaxId }),
    ...(status === '' ? {} : { fiscalStatusIn: [status] }),
    ...(recipientCity === '' ? {} : { recipientCityIn: [recipientCity] }),
    ...(recipientState === '' ? {} : { recipientStateIn: [recipientState] }),
  }
}

function buildRangeFilters(filters: DocumentFilters): TripReportFilters {
  const amount = normalizeTripReportAmount(filters.amountValue)
  const numberFrom = normalizeTripReportNumber(filters.numberFrom)
  const numberTo = normalizeTripReportNumber(filters.numberTo)
  return {
    ...(filters.dateFrom === '' ? {} : { issuedFrom: filters.dateFrom }),
    ...(filters.dateTo === '' ? {} : { issuedUntil: filters.dateTo }),
    ...(numberFrom === undefined ? {} : { numberFrom }),
    ...(numberTo === undefined ? {} : { numberTo }),
    ...(amount === undefined ? {} : { valueAmount: amount, valueOperator: filters.amountOperator }),
  }
}

/** `unlinkedOnly` não entra: o relatório só tem notas em viagem, o oposto do que ele esconde. */
export function translateNfeFiltersToTripReport(
  input: NfeTripReportTranslationInput,
): NfeTripReportTranslation {
  return {
    filters: {
      ...buildListFilters(input.filters),
      ...buildRangeFilters(input.filters),
      ...buildTextFilters(input.filters, input.searchTerm),
    },
    unsupported: input.isAdvancedActive ? ['advanced'] : [],
  }
}
