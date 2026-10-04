/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4 (correção da revisão da Fase 4a, L3): a data do roteiro em todo formato que o Excel
 * grava — o serial no sistema 1900 (o padrão), o serial no sistema 1904 (`workbookPr date1904`, do
 * Excel antigo do Mac: o mesmo número é outro dia) e a célula `t="d"` em ISO, com ou sem hora.
 */
import { describe, expect, test } from 'bun:test'

import { parseCargoPreviewWorkbook } from '../../src/cargo-receiving/domain/cargo-preview-workbook.parser.js'
import {
  buildCargoPreviewWorkbook,
  FR_COLUMN_MAP,
  IMPORT_SHEET_NAME,
  type FixtureCell,
} from '../fixtures/cargo-preview-workbook.fixture.js'

function routingDateOf(input: { readonly cell: FixtureCell; readonly date1904?: boolean }) {
  const result = parseCargoPreviewWorkbook({
    bytes: buildCargoPreviewWorkbook({
      ...(input.date1904 === undefined ? {} : { date1904: input.date1904 }),
      reservedEmptyRows: 3,
      rows: [{ 'PESO TOTAL': 10, RouteName: 'FR.S.CAR', RoutingDate: input.cell, VALOR: 100 }],
    }),
    clock: () => performance.now(),
    columnMap: FR_COLUMN_MAP,
    sheetName: IMPORT_SHEET_NAME,
  })
  return result.rowErrors.length > 0 ? 'error' : result.rows[0]?.routingDate
}

describe('a data do roteiro em todo formato do Excel (spec 237 L3)', () => {
  test('o serial no sistema 1900 é o de sempre', () => {
    expect(routingDateOf({ cell: 46297 })).toBe('2026-10-02')
  })

  test('o mesmo serial no sistema 1904 é 1 462 dias depois', () => {
    expect(routingDateOf({ cell: 44835, date1904: true })).toBe('2026-10-02')
    expect(routingDateOf({ cell: 0, date1904: true })).toBe('1904-01-01')
  })

  test.each([
    ['2026-10-02', '2026-10-02'],
    ['2026-10-02T00:00:00', '2026-10-02'],
    ['2026-10-02T13:45:00.000Z', '2026-10-02'],
  ])('a célula t="d" %p vira %p', (text, expected) => {
    expect(routingDateOf({ cell: { date: text } })).toBe(expected)
  })

  test.each(['2026-02-30T00:00:00', '2026-10-02T25:00:00', 'ontem'])(
    'data ISO inválida (%p) é erro da linha',
    (text) => {
      expect(routingDateOf({ cell: { date: text } })).toBe('error')
    },
  )
})
