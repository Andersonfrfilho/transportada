/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S1/S4): os ataques medidos pelo revisor, todos abaixo de
 * 960 KiB. Antes: 87 KiB travavam o event loop por 8,3 min e subiam a 2,27 GB; 123 KiB, 1,36 GB; o
 * decimal enorme, 22,9 s com SUCESSO. Os tetos de tempo e memória daqui são folgados (a CI é mais
 * lenta), mas finitos — o código antigo estoura todos.
 */
import { describe, expect, test } from 'bun:test'

import { resolvePreviewHeader } from '../../src/cargo-receiving/domain/cargo-preview-header.policy.js'
import { readPreviewItems } from '../../src/cargo-receiving/domain/cargo-preview-row.parser.js'
import { readNonNegativeDecimal } from '../../src/cargo-receiving/domain/cargo-preview-value.policy.js'
import { CARGO_PREVIEW_WORKBOOK_LIMITS } from '../../src/cargo-receiving/domain/cargo-preview-workbook.constant.js'
import { CargoPreviewWorkbookError } from '../../src/cargo-receiving/domain/cargo-preview-workbook.error.js'
import { parseCargoPreviewWorkbook } from '../../src/cargo-receiving/domain/cargo-preview-workbook.parser.js'
import type {
  CargoPreviewWorkbookLimits,
  ParseCargoPreviewWorkbookResult,
  SheetCell,
  SheetRow,
} from '../../src/cargo-receiving/domain/cargo-preview-workbook.types.js'
import {
  ATTACK_COLUMN_MAP,
  buildHugeDecimalAttack,
  buildSingleRowAttack,
  buildWideRowsAttack,
} from '../fixtures/cargo-preview-attack.fixture.js'

const MEBIBYTE = 1024 * 1024
const UPLOAD_MAX_BYTES = 960 * 1024
/** Teto de relógio de parede por ataque: o código corrigido leva milissegundos. */
const ATTACK_TIME_CEILING_MS = 3_000
/** Teto de crescimento do RSS por ataque: o antigo ia de 530 MB a 2,27 GB. */
const ATTACK_MEMORY_CEILING_BYTES = 256 * MEBIBYTE

type Measured = {
  readonly code: string | undefined
  readonly elapsedMs: number
  readonly result: ParseCargoPreviewWorkbookResult | undefined
  readonly rssGrowthBytes: number
}

function measure(bytes: Uint8Array, limits?: CargoPreviewWorkbookLimits): Measured {
  expect(bytes.length).toBeLessThan(UPLOAD_MAX_BYTES)
  Bun.gc(true)
  const rssBefore = process.memoryUsage.rss()
  const startedAt = performance.now()
  let code: string | undefined
  let result: ParseCargoPreviewWorkbookResult | undefined
  try {
    result = parseCargoPreviewWorkbook({
      bytes,
      clock: () => performance.now(),
      columnMap: ATTACK_COLUMN_MAP,
      sheetName: null,
      ...(limits === undefined ? {} : { limits }),
    })
  } catch (error) {
    if (!(error instanceof CargoPreviewWorkbookError)) throw error
    code = error.code
  }
  const elapsedMs = performance.now() - startedAt
  return { code, elapsedMs, result, rssGrowthBytes: process.memoryUsage.rss() - rssBefore }
}

function expectBounded(measured: Measured): void {
  expect(measured.elapsedMs).toBeLessThan(ATTACK_TIME_CEILING_MS)
  expect(measured.rssGrowthBytes).toBeLessThan(ATTACK_MEMORY_CEILING_BYTES)
}

function throwingBudget() {
  return {
    check: (): void => {
      throw new CargoPreviewWorkbookError('PREVIEW_PARSE_TIMEOUT')
    },
  }
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action()
  } catch (error) {
    if (error instanceof CargoPreviewWorkbookError) return error.code
    throw error
  }
  return undefined
}

function sheetRow(rowNumber: number, texts: readonly string[]): SheetRow {
  const cells = new Map<string, SheetCell>()
  texts.forEach((text, index) => cells.set(`C${index}`, { isNumeric: false, text }))
  return { cells, rowNumber }
}

describe('a planilha hostil não segura o worker (spec 237, segurança S1/S4)', () => {
  test('87 KiB com uma linha de ~760 mil células iguais (29 MiB de aba): bomba, sem travar', () => {
    const measured = measure(buildSingleRowAttack(760_000))
    expect(measured.code).toBe('PREVIEW_ZIP_BOMB')
    expectBounded(measured)
  }, 30_000)

  test('9 KiB com 80 mil células numa linha: PREVIEW_TOO_MANY_CELLS', () => {
    const measured = measure(buildSingleRowAttack(80_000))
    expect(measured.code).toBe('PREVIEW_TOO_MANY_CELLS')
    expectBounded(measured)
  })

  test('20 000 linhas de 90 células (123 KiB, 27 MiB de aba): bomba, sem travar', () => {
    const measured = measure(buildWideRowsAttack({ cellsPerRow: 90, rowCount: 20_000 }))
    expect(measured.code).toBe('PREVIEW_ZIP_BOMB')
    expectBounded(measured)
  })

  test('5 000 linhas de 90 células dentro dos 8 MiB: recusada pelo teto total de células', () => {
    const measured = measure(buildWideRowsAttack({ cellsPerRow: 90, rowCount: 5_000 }))
    expect(measured.code).toBe('PREVIEW_TOO_MANY_CELLS')
    expectBounded(measured)
  })

  test('2 000 linhas com VALOR e PESO num decimal de 32,7 mil dígitos: erro de linha, rápido', () => {
    const measured = measure(buildHugeDecimalAttack({ digits: 32_700, rowCount: 2_000 }))
    expect(measured.code).toBeUndefined()
    expect(measured.result?.rows).toEqual([])
    expect(measured.result?.rowErrors).toHaveLength(4_000)
    expect(new Set(measured.result?.rowErrors.map((error) => error.field))).toEqual(
      new Set(['value', 'weightKg']),
    )
    expectBounded(measured)
  })

  test('o teto de células por linha é exato: 512 passam, 513 não', () => {
    const limits = { ...CARGO_PREVIEW_WORKBOOK_LIMITS }
    expect(measure(buildSingleRowAttack(limits.rowCells), limits).code).toBe(
      'PREVIEW_COLUMN_NOT_FOUND',
    )
    expect(measure(buildSingleRowAttack(limits.rowCells + 1), limits).code).toBe(
      'PREVIEW_TOO_MANY_CELLS',
    )
  })

  test('o teto total de células é exato', () => {
    const limits = { ...CARGO_PREVIEW_WORKBOOK_LIMITS, totalCells: 30 }
    const exact = buildWideRowsAttack({ cellsPerRow: 10, rowCount: 3 })
    const over = buildWideRowsAttack({ cellsPerRow: 10, rowCount: 4 })
    expect(measure(exact, limits).code).toBe('PREVIEW_COLUMN_NOT_FOUND')
    expect(measure(over, limits).code).toBe('PREVIEW_TOO_MANY_CELLS')
  })

  test('o cabeçalho com 100 mil nomes iguais é linear (antes: cópia do array a cada célula)', () => {
    const row = sheetRow(
      1,
      Array.from({ length: 100_000 }, () => 'X'),
    )
    const startedAt = performance.now()
    const code = codeOf(() =>
      resolvePreviewHeader({
        budget: { check: () => undefined },
        columnMap: ATTACK_COLUMN_MAP,
        headerSearchRows: 20,
        rows: [row],
      }),
    )
    expect(code).toBe('PREVIEW_COLUMN_NOT_FOUND')
    expect(performance.now() - startedAt).toBeLessThan(ATTACK_TIME_CEILING_MS)
  })

  test('o cabeçalho e os itens consultam o orçamento de tempo', () => {
    const header = sheetRow(1, ['ROTA', 'VALOR', 'PESO'])
    expect(
      codeOf(() =>
        resolvePreviewHeader({
          budget: throwingBudget(),
          columnMap: ATTACK_COLUMN_MAP,
          headerSearchRows: 20,
          rows: [header],
        }),
      ),
    ).toBe('PREVIEW_PARSE_TIMEOUT')
    const resolved = resolvePreviewHeader({
      budget: { check: () => undefined },
      columnMap: ATTACK_COLUMN_MAP,
      headerSearchRows: 20,
      rows: [header],
    })
    expect(
      codeOf(() =>
        readPreviewItems({
          budget: throwingBudget(),
          header: resolved,
          isDate1904: false,
          rows: [header, sheetRow(2, ['R1', '1', '1'])],
        }),
      ),
    ).toBe('PREVIEW_PARSE_TIMEOUT')
  })

  test('decimal em texto acima de 40 caracteres é inválido antes de qualquer conta', () => {
    const fortyCharacters = `1.${'0'.repeat(38)}`
    expect(fortyCharacters).toHaveLength(40)
    expect(
      readNonNegativeDecimal({
        cell: { isNumeric: false, text: fortyCharacters },
        maxIntegerDigits: 12,
        scale: 2,
      }),
    ).toEqual({ kind: 'value', text: '1.00' })
    expect(
      readNonNegativeDecimal({
        cell: { isNumeric: true, text: `${fortyCharacters}0` },
        maxIntegerDigits: 12,
        scale: 2,
      }),
    ).toEqual({ kind: 'invalid' })
    const startedAt = performance.now()
    for (let index = 0; index < 1_000; index += 1) {
      readNonNegativeDecimal({
        cell: { isNumeric: true, text: '9'.repeat(32_767) },
        maxIntegerDigits: 12,
        scale: 2,
      })
    }
    expect(performance.now() - startedAt).toBeLessThan(ATTACK_TIME_CEILING_MS)
  })
})
