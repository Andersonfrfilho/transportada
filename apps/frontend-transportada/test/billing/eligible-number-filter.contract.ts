/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './billing.fixture.js'

const FILTER_VALUE_MODULE = '../../src/modules/billing/shared/billingEligibleFilterValue.service'
const ELIGIBLE_TABLE_MODULE = '../../src/modules/billing/shared/billingEligibleTable.service'
const VALIDATION_MODULE = '../../src/modules/billing/shared/billingResponse.validation'

type NumberFilterFailure = { readonly ok: false; readonly reason: string }
type NumberFilterSuccess = {
  readonly ok: true
  readonly range?: { readonly from: string; readonly to: string }
  readonly values?: readonly string[]
}
type NumberFilterResult = NumberFilterFailure | NumberFilterSuccess

type FilterValueModule = {
  readonly NUMBER_FILTER_REASONS: Readonly<{
    INVALID: string
    MULTIPLE_RANGES: string
    RANGE_INVERTED: string
    TOO_MANY_VALUES: string
  }>
  readonly parseNumberFilterInput: (raw: string) => NumberFilterResult
}

type EligibleTableModule = {
  readonly EMPTY_BILLING_ELIGIBLE_FILTERS: Record<string, string>
  readonly countActiveBillingEligibleFilters: (filters: Record<string, string>) => number
  readonly serializeBillingEligibleQuery: (input: {
    readonly cursor: string | null
    readonly filters: Record<string, unknown>
    readonly limit: number
  }) => string
}

type EligiblePage = { readonly items: readonly { readonly nfeNumber: null | string }[] }

type ValidationModule = {
  readonly createBillingResponseAdapters: () => {
    readonly eligiblePageFromApi: (input: unknown) => EligiblePage
  }
}

/** Payload mínimo de elegível, anonimizado: só o número da nota varia entre os casos. */
function eligiblePayload(nfeNumber: null | string): Record<string, unknown> {
  return {
    batchId: '00000000-0000-4000-8000-000000000713',
    batchName: 'Lote julho',
    cteId: '00000000-0000-4000-8000-000000000711',
    cteNumber: '123456',
    customerDocument: '12345678000199',
    customerName: 'Cliente Exemplo',
    issuedAt: '2026-07-10T12:00:00.000Z',
    nfeNumber,
    totalAmount: '100.00',
  }
}

async function eligibleAdapter(): Promise<(input: unknown) => EligiblePage> {
  const { createBillingResponseAdapters } =
    await loadFutureModule<ValidationModule>(VALIDATION_MODULE)
  return createBillingResponseAdapters().eligiblePageFromApi
}

async function parse(raw: string): Promise<NumberFilterResult> {
  const { parseNumberFilterInput } = await loadFutureModule<FilterValueModule>(FILTER_VALUE_MODULE)
  return parseNumberFilterInput(raw)
}

async function searchFor(filters: Record<string, string>): Promise<URLSearchParams> {
  const { EMPTY_BILLING_ELIGIBLE_FILTERS, serializeBillingEligibleQuery } =
    await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)
  return new URLSearchParams(
    serializeBillingEligibleQuery({
      cursor: null,
      filters: { ...EMPTY_BILLING_ELIGIBLE_FILTERS, ...filters },
      limit: 25,
    }),
  )
}

describe('Billing eligible number filter contract', () => {
  test('reads loose values and one range out of the same field', async () => {
    expect(await parse('3, 7, 10-40')).toEqual({
      ok: true,
      range: { from: '10', to: '40' },
      values: ['3', '7'],
    })
  })

  test('accepts the separators an operator actually types', async () => {
    const expected: NumberFilterResult = { ok: true, range: { from: '10', to: '40' } }

    expect(await parse('10-40')).toEqual(expected)
    expect(await parse('10 - 40')).toEqual(expected)
    expect(await parse('10 – 40')).toEqual(expected)
    expect(await parse('10 até 40')).toEqual(expected)
  })

  test('a list on its own carries no range, and a blank field carries no filter', async () => {
    expect(await parse('3, 7')).toEqual({ ok: true, values: ['3', '7'] })
    expect(await parse('   ')).toEqual({ ok: true })
    expect(await parse('')).toEqual({ ok: true })
  })

  /** O furo que motivou a feature: entrada inválida virava `undefined` e a tela filtrava por nada. */
  test('names the reason instead of silently dropping the filter', async () => {
    const { NUMBER_FILTER_REASONS } = await loadFutureModule<FilterValueModule>(FILTER_VALUE_MODULE)

    expect(await parse('abc')).toEqual({ ok: false, reason: NUMBER_FILTER_REASONS.INVALID })
    expect(await parse('9,,43')).toEqual({ ok: false, reason: NUMBER_FILTER_REASONS.INVALID })
    expect(await parse('0')).toEqual({ ok: false, reason: NUMBER_FILTER_REASONS.INVALID })
    expect(await parse('1234567890')).toEqual({ ok: false, reason: NUMBER_FILTER_REASONS.INVALID })
    expect(await parse('40-10')).toEqual({
      ok: false,
      reason: NUMBER_FILTER_REASONS.RANGE_INVERTED,
    })
    expect(await parse('1-5, 10-40')).toEqual({
      ok: false,
      reason: NUMBER_FILTER_REASONS.MULTIPLE_RANGES,
    })
    const overflow = Array.from({ length: 101 }, (_, index) => String(index + 1)).join(',')
    expect(await parse(overflow)).toEqual({
      ok: false,
      reason: NUMBER_FILTER_REASONS.TOO_MANY_VALUES,
    })
  })

  test('a range of equal ends is a legitimate single number', async () => {
    expect(await parse('40-40')).toEqual({ ok: true, range: { from: '40', to: '40' } })
  })

  test('serializes list and range as the three keys the API allows', async () => {
    const search = await searchFor({ cteNumberQuery: '3, 7, 10-40' })

    expect(search.get('cteNumberIn')).toBe('3,7')
    expect(search.get('cteNumberFrom')).toBe('10')
    expect(search.get('cteNumberTo')).toBe('40')
    expect(search.has('cteNumber')).toBe(false)
  })

  test('sends the range alone without half of it leaking on its own', async () => {
    const rangeOnly = await searchFor({ cteNumberQuery: '10-40' })

    expect(rangeOnly.has('cteNumberIn')).toBe(false)
    expect(rangeOnly.get('cteNumberFrom')).toBe('10')
    expect(rangeOnly.get('cteNumberTo')).toBe('40')

    const listOnly = await searchFor({ cteNumberQuery: '3,7' })

    expect(listOnly.get('cteNumberIn')).toBe('3,7')
    expect(listOnly.has('cteNumberFrom')).toBe(false)
    expect(listOnly.has('cteNumberTo')).toBe(false)
  })

  test('an invalid field reaches the API as no filter at all', async () => {
    const search = await searchFor({ cteNumberQuery: '40-10' })

    expect(search.has('cteNumberIn')).toBe(false)
    expect(search.has('cteNumberFrom')).toBe(false)
    expect(search.has('cteNumberTo')).toBe(false)
  })

  /** O número da nota é o que o cliente cobra por telefone — o mesmo campo, o mesmo parser. */
  test('the linked note number filter reuses the same list-or-range parser', async () => {
    const search = await searchFor({ nfeNumberQuery: '3, 7, 10-40' })

    expect(search.get('nfeNumberIn')).toBe('3,7')
    expect(search.get('nfeNumberFrom')).toBe('10')
    expect(search.get('nfeNumberTo')).toBe('40')
  })

  test('the note filter sends range and list separately, and drops what is invalid', async () => {
    const rangeOnly = await searchFor({ nfeNumberQuery: '10-40' })

    expect(rangeOnly.has('nfeNumberIn')).toBe(false)
    expect(rangeOnly.get('nfeNumberFrom')).toBe('10')
    expect(rangeOnly.get('nfeNumberTo')).toBe('40')

    const listOnly = await searchFor({ nfeNumberQuery: '4521' })

    expect(listOnly.get('nfeNumberIn')).toBe('4521')
    expect(listOnly.has('nfeNumberFrom')).toBe(false)

    const invalid = await searchFor({ nfeNumberQuery: '40-10' })

    expect(invalid.has('nfeNumberIn')).toBe(false)
    expect(invalid.has('nfeNumberFrom')).toBe(false)
    expect(invalid.has('nfeNumberTo')).toBe(false)
  })

  test('the note field is part of the empty filter state and of the active count', async () => {
    const { EMPTY_BILLING_ELIGIBLE_FILTERS, countActiveBillingEligibleFilters } =
      await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)

    expect(EMPTY_BILLING_ELIGIBLE_FILTERS.nfeNumberQuery).toBe('')
    expect(
      countActiveBillingEligibleFilters({
        ...EMPTY_BILLING_ELIGIBLE_FILTERS,
        nfeNumberQuery: '4521',
      }),
    ).toBe(1)
  })

  /** Item sem nota vinculada continua listável: a coluna fica vazia, a linha não some. */
  test('accepts a null note number in the eligible response', async () => {
    const eligiblePageFromApi = await eligibleAdapter()

    const [withNote, withoutNote] = eligiblePageFromApi({
      data: [eligiblePayload('4521'), eligiblePayload(null)],
      page: { nextCursor: null },
    }).items

    expect(withNote?.nfeNumber).toBe('4521')
    expect(withoutNote?.nfeNumber).toBeNull()
  })

  test('refuses an eligible row whose note number is neither string nor null', async () => {
    const eligiblePageFromApi = await eligibleAdapter()

    expect(() =>
      eligiblePageFromApi({
        data: [{ ...eligiblePayload(null), nfeNumber: 4521 }],
        page: { nextCursor: null },
      }),
    ).toThrow()
  })
})
