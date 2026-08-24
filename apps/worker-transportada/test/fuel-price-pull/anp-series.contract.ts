/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseAnpWeeklyWorkbook } from '../../src/fuel-price-pull/infrastructure/anp-series.client.js'

import {
  ANP_ESTADOS_ROWS,
  ANP_HEADER_LABELS,
  buildAnpWorkbook,
  type AnpSheetRow,
} from './workbook.fixture.js'

type ParsedReference = {
  readonly averagePricePerUnit: string
  readonly product: string
  readonly state: string
  readonly stationCount: number
  readonly unit: string
}

function parseFixture(input?: Parameters<typeof buildAnpWorkbook>[0]): {
  readonly discardedRows: number
  readonly references: readonly ParsedReference[]
  readonly weekEndingOn: string
  readonly weekStartingOn: string
} {
  return parseAnpWeeklyWorkbook({ bytes: buildAnpWorkbook(input) })
}

function referenceFor(input: {
  readonly product: string
  readonly references: readonly ParsedReference[]
  readonly state: string
}): ParsedReference | undefined {
  return input.references.find(
    (reference) => reference.product === input.product && reference.state === input.state,
  )
}

describe('ANP weekly series parser', () => {
  test('skips the preamble and finds the header by its labels, not by row number', () => {
    const series = parseFixture()

    expect(series.references).toHaveLength(8)
    expect(series.references.some((reference) => reference.state.includes('ANP'))).toBeFalse()

    const shifted = parseFixture({ extraPreambleRow: 'FONTE: ANP/SDC' })

    expect(shifted).toEqual(series)
  })

  test('resolves the ESTADOS sheet through the workbook relationships', () => {
    expect(parseFixture({ shouldSwapSheetTargets: true })).toEqual(parseFixture())
  })

  test('turns the Excel serial dates into the Sunday-to-Saturday week', () => {
    const series = parseFixture()

    expect(series.weekStartingOn).toBe('2026-08-09')
    expect(series.weekEndingOn).toBe('2026-08-15')
  })

  test('turns the native cell into a Decimal without going through float', () => {
    const { references } = parseFixture()

    expect(referenceFor({ product: 'gnv', references, state: 'AL' })?.averagePricePerUnit).toBe(
      '4.3900',
    )
    expect(
      referenceFor({ product: 'diesel-s10', references, state: 'ES' })?.averagePricePerUnit,
    ).toBe('6.7300')
    expect(
      referenceFor({ product: 'etanol-hidratado', references, state: 'AC' })?.averagePricePerUnit,
    ).toBe('5.0000')
  })

  test('translates the ANP label of every catalogue product, with dry OLEO DIESEL as S-500', () => {
    const { references } = parseFixture()
    const products = references.map((reference) => reference.product)

    expect(new Set(products)).toEqual(
      new Set(['diesel-s10', 'diesel-s500', 'etanol-hidratado', 'gasolina-comum', 'gnv']),
    )
    expect(referenceFor({ product: 'diesel-s500', references, state: 'AC' })).toBeDefined()
    expect(referenceFor({ product: 'diesel-s10', references, state: 'SP' })?.stationCount).toBe(833)
  })

  test('keeps the gas in cubic metres and never converts it to a litre price', () => {
    const { references } = parseFixture()
    const gnv = referenceFor({ product: 'gnv', references, state: 'AL' })

    expect(gnv?.unit).toBe('cubic-metre')
    expect(gnv?.averagePricePerUnit).toBe('4.3900')
    expect(
      references
        .filter((reference) => reference.product !== 'gnv')
        .every((reference) => reference.unit === 'litre'),
    ).toBeTrue()
  })

  test('turns the spelled-out state, uppercase and unaccented, into a sigla', () => {
    const { references } = parseFixture()
    const states = references.map((reference) => reference.state)

    expect(new Set(states)).toEqual(new Set(['AC', 'AL', 'AM', 'ES', 'SP']))
  })

  test('discards GASOLINA ADITIVADA and GLP without failing, and reports how many', () => {
    const series = parseFixture()

    expect(series.discardedRows).toBe(2)
    expect(
      series.references.some((reference) => reference.unit.includes('kg') || reference.unit === ''),
    ).toBeFalse()
  })

  test('records only the states that came for a product covered in fewer UFs', () => {
    const gnv = parseFixture().references.filter((reference) => reference.product === 'gnv')

    expect(gnv.map((reference) => reference.state).sort()).toEqual(['AL', 'AM'])
  })

  test('ignores the trailing styled row without counting it as discarded', () => {
    const singleRow = ANP_ESTADOS_ROWS.filter(
      (row): row is AnpSheetRow => row.product === 'OLEO DIESEL S10' && row.state === 'SAO PAULO',
    )
    const series = parseFixture({ rows: singleRow })

    expect(series.references).toHaveLength(1)
    expect(series.discardedRows).toBe(0)
  })

  test('aborts on an unexpected header instead of writing a reference', () => {
    const headerLabels = ANP_HEADER_LABELS.map((label) =>
      label === 'PREÇO MÉDIO REVENDA' ? 'PRECO MEDIO DISTRIBUICAO' : label,
    )

    expect(() => parseFixture({ headerLabels })).toThrow('ANP_UNEXPECTED_HEADER')
  })
})
