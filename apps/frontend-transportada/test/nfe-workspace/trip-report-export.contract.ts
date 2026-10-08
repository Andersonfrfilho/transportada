/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { i18n } from '@/modules/shared/i18n/i18n.service'
import {
  EMPTY_FILTERS,
  type DocumentFilters,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import { buildExcludedWithoutTripNotice } from '../../src/modules/nfe-workspace/shared/nfeTripReportNotice.service'
import { translateNfeFiltersToTripReport } from '../../src/modules/nfe-workspace/shared/nfeTripReportFilters.service'
import { buildTripReportSearch } from '../../src/modules/trip/shared/tripReportClient.service'

function translate(
  overrides: Partial<DocumentFilters> = {},
  extra: Partial<Parameters<typeof translateNfeFiltersToTripReport>[0]> = {},
) {
  return translateNfeFiltersToTripReport({
    filters: { ...EMPTY_FILTERS, ...overrides },
    isAdvancedActive: false,
    searchTerm: '',
    ...extra,
  })
}

describe('nfe tab filters to trip report filters (spec 253 T4.5)', () => {
  test('empty tab filters translate to an exact, empty report filter', () => {
    expect(translate()).toEqual({ filters: {}, unsupported: [] })
  })

  test('the default unlinkedOnly is not a filter the report knows and does not count', () => {
    expect(translate({ unlinkedOnly: false })).toEqual({ filters: {}, unsupported: [] })
  })

  test('search term becomes search, trimmed', () => {
    expect(translate({}, { searchTerm: '  1234 ' }).filters).toEqual({ search: '1234' })
    expect(translate({}, { searchTerm: '   ' }).filters).toEqual({})
  })

  test('recipient city and state become the report list filters', () => {
    const { filters, unsupported } = translate({
      select: {
        ...EMPTY_FILTERS.select,
        recipientCity: 'Campinas',
        recipientState: 'SP',
      },
    })
    expect(filters).toEqual({ recipientCityIn: ['Campinas'], recipientStateIn: ['SP'] })
    expect(unsupported).toEqual([])
  })

  test('amount with operator and value becomes valueOperator and valueAmount', () => {
    expect(translate({ amountOperator: 'gt', amountValue: '1500,5' }).filters).toEqual({
      valueAmount: '1500.5',
      valueOperator: 'gt',
    })
  })

  test('incomplete or invalid amount is dropped, never sent', () => {
    expect(translate({ amountOperator: 'gt', amountValue: '' }).filters).toEqual({})
    expect(translate({ amountOperator: 'gt', amountValue: 'abc' }).filters).toEqual({})
    expect(translate({ amountOperator: 'gt', amountValue: '  ' }).filters).toEqual({})
  })

  const CONTROL_TO_PARAMETER: readonly (readonly [
    string,
    Partial<DocumentFilters>,
    Record<string, unknown>,
  ])[] = [
    ['numberFrom', { numberFrom: ' 10 ' }, { numberFrom: '10' }],
    ['numberTo', { numberTo: '99' }, { numberTo: '99' }],
    ['dateFrom', { dateFrom: '2026-01-01' }, { issuedFrom: '2026-01-01' }],
    ['dateTo', { dateTo: '2026-01-31' }, { issuedUntil: '2026-01-31' }],
    [
      'emitterName',
      { multi: { emitterName: ['Acme', 'Beta'], emitterTaxId: [] } },
      { emitterNameIn: ['Acme', 'Beta'] },
    ],
    [
      'emitterTaxId',
      { multi: { emitterName: [], emitterTaxId: ['123'] } },
      { emitterTaxIdIn: ['123'] },
    ],
    [
      'emitterCity',
      { select: { ...EMPTY_FILTERS.select, emitterCity: 'Rio' } },
      { emitterCityIn: ['Rio'] },
    ],
    [
      'emitterState',
      { select: { ...EMPTY_FILTERS.select, emitterState: 'RJ' } },
      { emitterStateIn: ['RJ'] },
    ],
    [
      'status',
      { select: { ...EMPTY_FILTERS.select, status: 'denied' } },
      { fiscalStatusIn: ['denied'] },
    ],
    [
      'cteIssued',
      { select: { ...EMPTY_FILTERS.select, cteIssued: 'pending' } },
      { cteIssued: 'pending' },
    ],
    [
      'emitterAddress',
      { text: { ...EMPTY_FILTERS.text, emitterAddress: ' Rua A ' } },
      { emitterAddress: 'Rua A' },
    ],
    [
      'recipientName',
      { text: { ...EMPTY_FILTERS.text, recipientName: 'Maria' } },
      { recipientName: 'Maria' },
    ],
    [
      'recipientAddress',
      { text: { ...EMPTY_FILTERS.text, recipientAddress: 'Av B' } },
      { recipientAddress: 'Av B' },
    ],
  ]

  for (const [control, overrides, expected] of CONTROL_TO_PARAMETER) {
    test(`${control} becomes its report parameter and is not unsupported`, () => {
      expect(translate(overrides)).toEqual({ filters: expected, unsupported: [] })
    })
  }

  test('a non-numeric invoice number is dropped, never sent', () => {
    expect(translate({ numberFrom: '12a', numberTo: '' }).filters).toEqual({})
  })

  test('every control together survives serialization with the API parameter names', () => {
    const { filters } = translate(
      {
        amountOperator: 'gte',
        amountValue: '10',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        multi: { emitterName: ['Acme', 'Beta'], emitterTaxId: ['123'] },
        numberFrom: '1',
        numberTo: '9',
        select: {
          cteIssued: 'issued',
          emitterCity: 'Rio',
          emitterState: 'RJ',
          recipientCity: 'Campinas',
          recipientState: 'SP',
          status: 'authorized',
        },
        text: { emitterAddress: 'Rua A', recipientAddress: 'Av B', recipientName: 'Maria' },
      },
      { searchTerm: 'abc' },
    )
    const parameters = new URLSearchParams(
      buildTripReportSearch({ cursor: null, filters, limit: 50 }),
    )
    expect(Object.fromEntries(parameters)).toEqual({
      cteIssued: 'issued',
      emitterAddress: 'Rua A',
      emitterCityIn: 'Rio',
      emitterNameIn: 'Acme,Beta',
      emitterStateIn: 'RJ',
      emitterTaxIdIn: '123',
      fiscalStatusIn: 'authorized',
      issuedFrom: '2026-01-01',
      issuedUntil: '2026-01-31',
      limit: '50',
      numberFrom: '1',
      numberTo: '9',
      recipientAddress: 'Av B',
      recipientCityIn: 'Campinas',
      recipientName: 'Maria',
      recipientStateIn: 'SP',
      search: 'abc',
      valueAmount: '10',
      valueOperator: 'gte',
    })
  })

  test('advanced mode with conditions is unsupported as a whole', () => {
    expect(translate({}, { isAdvancedActive: true }).unsupported).toEqual(['advanced'])
  })
})

describe('excluded-without-trip notice (spec 253 T4.5)', () => {
  const portuguese = i18n.getFixedT('pt-BR', 'nfeWorkspace')
  const english = i18n.getFixedT('en', 'nfeWorkspace')

  test('no notice for zero', () => {
    expect(buildExcludedWithoutTripNotice({ count: 0, translate: portuguese })).toBeUndefined()
  })

  test('singular and plural in pt-BR', () => {
    expect(buildExcludedWithoutTripNotice({ count: 1, translate: portuguese })).toBe(
      '1 nota sem viagem ficou de fora',
    )
    expect(buildExcludedWithoutTripNotice({ count: 7, translate: portuguese })).toBe(
      '7 notas sem viagem ficaram de fora',
    )
  })

  test('singular and plural in en', () => {
    expect(buildExcludedWithoutTripNotice({ count: 1, translate: english })).toBe(
      '1 invoice without a trip was left out',
    )
    expect(buildExcludedWithoutTripNotice({ count: 7, translate: english })).toBe(
      '7 invoices without a trip were left out',
    )
  })
})
