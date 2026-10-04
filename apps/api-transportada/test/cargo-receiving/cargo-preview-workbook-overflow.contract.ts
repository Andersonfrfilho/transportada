/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4 (correção da revisão da Fase 4a, H2): número maior que a coluna do item é erro da
 * LINHA, nunca da planilha — e nunca chega ao banco, onde estouraria o `numeric` e envenenaria a
 * mensagem. O teto de dígitos inteiros de cada campo é o da coluna: `value numeric(14,2)` → 12,
 * `weight_kg numeric(12,3)` → 9, `volume_m3 numeric(12,4)` → 8.
 */
import { describe, expect, test } from 'bun:test'

import { PREVIEW_DECIMAL_FIELDS } from '../../src/cargo-receiving/domain/cargo-preview-workbook.constant.js'
import { parseCargoPreviewWorkbook } from '../../src/cargo-receiving/domain/cargo-preview-workbook.parser.js'
import {
  buildCargoPreviewWorkbook,
  FR_COLUMN_MAP,
  IMPORT_SHEET_NAME,
  type FixtureRow,
} from '../fixtures/cargo-preview-workbook.fixture.js'

const BASE: FixtureRow = {
  Company: 42647,
  'PESO TOTAL': 10,
  RouteName: 'FR.S.CAR',
  RoutingDate: 46297,
  VALOR: 100,
  'VOLUME(M3)': 0.5,
}

function read(rows: readonly FixtureRow[]) {
  return parseCargoPreviewWorkbook({
    bytes: buildCargoPreviewWorkbook({ reservedEmptyRows: 5, rows }),
    clock: () => performance.now(),
    columnMap: FR_COLUMN_MAP,
    sheetName: IMPORT_SHEET_NAME,
  })
}

describe('número maior que a coluna é erro da linha (spec 237 H2)', () => {
  test('o teto de cada campo é o da coluna do item', () => {
    expect(PREVIEW_DECIMAL_FIELDS).toEqual({
      value: { maxIntegerDigits: 12, scale: 2 },
      volumeM3: { maxIntegerDigits: 8, scale: 4 },
      weightKg: { maxIntegerDigits: 9, scale: 3 },
    })
  })

  test.each([
    ['um EAN-13 em VALOR', { VALOR: 7_891_234_567_895 }, 'value'],
    ['13 dígitos em VALOR', { VALOR: 1_000_000_000_000 }, 'value'],
    ['um telefone em PESO', { 'PESO TOTAL': 11_987_654_321 }, 'weightKg'],
    ['10 dígitos em PESO', { 'PESO TOTAL': 1_000_000_000 }, 'weightKg'],
    ['9 dígitos em VOLUME', { 'VOLUME(M3)': 123_456_789 }, 'volumeM3'],
    ['VALOR em texto com 13 dígitos', { VALOR: { inline: '1234567890123,45' } }, 'value'],
  ])('%s vira erro da linha, e a planilha segue', (_label, override, field) => {
    const result = read([
      { ...BASE, Text001: 1 },
      { ...BASE, ...override, Text001: 2 },
    ])
    expect(result.rows.map((row) => row.contractorReference)).toEqual(['1'])
    expect(result.rowErrors.map((error) => `${error.rowNumber}:${error.field}`)).toEqual([
      `6:${field}`,
    ])
  })

  test('no limite da coluna, a linha entra', () => {
    const result = read([
      {
        ...BASE,
        'PESO TOTAL': 999_999_999.999,
        VALOR: 999_999_999_999.99,
        'VOLUME(M3)': 99_999_999.9999,
      },
    ])
    expect(result.rowErrors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      value: '999999999999.99',
      volumeM3: '99999999.9999',
      weightKg: '999999999.999',
    })
  })

  test('o arredondamento que leva ao dígito a mais também é erro: 999999999,9995 kg', () => {
    const result = read([{ ...BASE, 'PESO TOTAL': { inline: '999999999,9995' } }])
    expect(result.rowErrors.map((error) => error.field)).toEqual(['weightKg'])
  })
})
