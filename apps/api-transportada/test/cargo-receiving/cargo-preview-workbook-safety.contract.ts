/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.1/T4.3 (ADR-0094 §7): a planilha é entrada hostil. Cada teto é uma constante nomeada,
 * e cada violação é um erro tipado — nunca uma exceção da biblioteca, nunca leitura parcial.
 */
import { describe, expect, test } from 'bun:test'
import { strToU8 } from 'fflate'

import { CARGO_PREVIEW_WORKBOOK_LIMITS } from '../../src/cargo-receiving/domain/cargo-preview-workbook.constant.js'
import { CargoPreviewWorkbookError } from '../../src/cargo-receiving/domain/cargo-preview-workbook.error.js'
import { parseCargoPreviewWorkbook } from '../../src/cargo-receiving/domain/cargo-preview-workbook.parser.js'
import type { CargoPreviewWorkbookLimits } from '../../src/cargo-receiving/domain/cargo-preview-workbook.types.js'
import {
  buildCargoPreviewWorkbook,
  FR_COLUMN_MAP,
  IMPORT_SHEET_NAME,
  MACRO_ENTRY,
  SHEET_ENTRY,
  zipEntries,
} from '../fixtures/cargo-preview-workbook.fixture.js'
import {
  markAsZip64,
  patchCentralDirectory,
  prependToZip,
} from '../fixtures/cargo-preview-zip.fixture.js'

const MEBIBYTE = 1024 * 1024
const ITEM = { PostalCode: '13560000', 'PESO TOTAL': 10.5, RouteName: 'FR.S.CAR', VALOR: 100 }

function parse(
  bytes: Uint8Array,
  extra: { clock?: () => number; limits?: CargoPreviewWorkbookLimits } = {},
) {
  return parseCargoPreviewWorkbook({
    bytes,
    clock: extra.clock ?? (() => performance.now()),
    columnMap: FR_COLUMN_MAP,
    sheetName: IMPORT_SHEET_NAME,
    ...(extra.limits === undefined ? {} : { limits: extra.limits }),
  })
}

function codeOf(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    if (error instanceof CargoPreviewWorkbookError) return error.code
    throw error
  }
  throw new Error('EXPECTED_CARGO_PREVIEW_WORKBOOK_ERROR')
}

function withLimits(overrides: Partial<CargoPreviewWorkbookLimits>): CargoPreviewWorkbookLimits {
  return { ...CARGO_PREVIEW_WORKBOOK_LIMITS, ...overrides }
}

describe('os tetos da leitura da prévia (spec 237 T4.1, ADR-0094 §7)', () => {
  test('os tetos são os do ADR, medidos contra as planilhas FR', () => {
    expect(CARGO_PREVIEW_WORKBOOK_LIMITS).toEqual({
      cellTextLength: 32_767,
      entryBytes: 8 * MEBIBYTE,
      fileBytes: 5 * MEBIBYTE,
      headerSearchRows: 20,
      lastDataRow: 5_000,
      metadataEntryBytes: MEBIBYTE,
      parseBudgetMs: 5_000,
      rowCells: 512,
      sharedStrings: 200_000,
      totalBytes: 16 * MEBIBYTE,
      totalCells: 120_000,
      zipEntries: 100,
    })
  })

  test('a planilha no formato real é lida', () => {
    const result = parse(buildCargoPreviewWorkbook({ rows: [ITEM] }))
    expect(result.rows).toHaveLength(1)
    expect(result.rowErrors).toEqual([])
  })

  test('arquivo acima de 5 MiB é recusado antes de abrir o zip', () => {
    const bytes = new Uint8Array(5 * MEBIBYTE + 1)
    bytes.set([0x50, 0x4b, 0x03, 0x04])
    const error = (() => {
      try {
        parse(bytes)
      } catch (caught) {
        return caught
      }
      return undefined
    })()
    expect(error).toBeInstanceOf(CargoPreviewWorkbookError)
    expect((error as CargoPreviewWorkbookError).code).toBe('PREVIEW_FILE_TOO_LARGE')
    expect((error as CargoPreviewWorkbookError).status).toBe(413)
  })

  test.each([
    ['texto CSV', strToU8('RouteName;VALOR\nFR.S.CAR;100\n')],
    ['PDF', strToU8('%PDF-1.7\n')],
    ['vazio', new Uint8Array(0)],
  ])('bytes mágicos errados (%s) não são planilha', (_label, bytes) => {
    expect(codeOf(() => parse(bytes))).toBe('PREVIEW_NOT_A_WORKBOOK')
  })

  test('poliglota (PDF com um zip válido no fim) é recusado pelos bytes mágicos', () => {
    const workbook = buildCargoPreviewWorkbook({ rows: [ITEM] })
    expect(parse(workbook).rows).toHaveLength(1)
    const polyglot = prependToZip(workbook, strToU8('%PDF-1.7\n%%EOF\n'))
    expect(codeOf(() => parse(polyglot))).toBe('PREVIEW_NOT_A_WORKBOOK')
  })

  test('arquivo truncado não é planilha (e não vaza erro da biblioteca)', () => {
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM] })
    expect(codeOf(() => parse(bytes.subarray(0, Math.floor(bytes.length / 2))))).toBe(
      'PREVIEW_NOT_A_WORKBOOK',
    )
  })

  test('mais de 100 entradas no zip é recusado', () => {
    const entries = Object.fromEntries(
      Array.from({ length: 101 }, (_unused, index) => [`xl/media/image${index}.png`, strToU8('x')]),
    )
    expect(codeOf(() => parse(buildCargoPreviewWorkbook({ entries })))).toBe(
      'PREVIEW_TOO_MANY_ENTRIES',
    )
  })

  test.each(['../evil.xml', 'xl/../../evil.xml', '/etc/passwd', 'xl\\..\\evil.xml', 'C:/evil.xml'])(
    'entrada com caminho inseguro (%s) recusa o arquivo, mesmo sem ser lida',
    (entryName) => {
      const bytes = buildCargoPreviewWorkbook({ entries: { [entryName]: strToU8('x') } })
      expect(codeOf(() => parse(bytes))).toBe('PREVIEW_ZIP_ENTRY_UNSAFE')
    },
  )

  test('aba declarada acima de 8 MiB é bomba, recusada antes de descomprimir', () => {
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM] })
    const patched = patchCentralDirectory(bytes, {
      entryName: SHEET_ENTRY,
      uncompressedSize: 8 * MEBIBYTE + 1,
    })
    expect(codeOf(() => parse(patched))).toBe('PREVIEW_ZIP_BOMB')
  })

  test('tamanho declarado mentiroso: a descompressão contada para no declarado', () => {
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM] })
    const patched = patchCentralDirectory(bytes, { entryName: SHEET_ENTRY, uncompressedSize: 64 })
    expect(codeOf(() => parse(patched))).toBe('PREVIEW_ZIP_BOMB')
  })

  test('descompressão real acima do teto por entrada é bomba', () => {
    const limits = withLimits({ entryBytes: 64 * 1024 })
    const bytes = buildCargoPreviewWorkbook({ reservedEmptyRows: 3_000, rows: [ITEM] })
    expect(codeOf(() => parse(bytes, { limits }))).toBe('PREVIEW_ZIP_BOMB')
  })

  test('a soma das entradas lidas acima do teto total é bomba', () => {
    const bytes = buildCargoPreviewWorkbook({ reservedEmptyRows: 500, rows: [ITEM] })
    const limits = withLimits({ entryBytes: 8 * MEBIBYTE, totalBytes: 20 * 1024 })
    expect(codeOf(() => parse(bytes, { limits }))).toBe('PREVIEW_ZIP_BOMB')
  })

  test('workbook.xml acima de 1 MiB é bomba', () => {
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM] })
    const patched = patchCentralDirectory(bytes, {
      entryName: 'xl/workbook.xml',
      uncompressedSize: MEBIBYTE + 1,
    })
    expect(codeOf(() => parse(patched))).toBe('PREVIEW_ZIP_BOMB')
  })

  test('a macro nunca é descomprimida: um vbaProject.bin de 40 MiB não pesa nada', () => {
    const macro = new Uint8Array(40 * MEBIBYTE)
    const bytes = buildCargoPreviewWorkbook({ macro, rows: [ITEM] })
    expect(bytes.length).toBeLessThan(CARGO_PREVIEW_WORKBOOK_LIMITS.fileBytes)
    expect(parse(bytes).rows).toHaveLength(1)
  })

  test('a macro marcada como cifrada e com tamanho mentiroso não é tocada', () => {
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM] })
    const patched = patchCentralDirectory(bytes, {
      entryName: MACRO_ENTRY,
      flags: 1,
      uncompressedSize: 1,
    })
    expect(parse(patched).rows).toHaveLength(1)
  })

  test('a aba RESULTADO nunca é aberta', () => {
    const resultSheetXml = '<!DOCTYPE x [<!ENTITY a "a">]><worksheet>&a;</worksheet>'
    expect(parse(buildCargoPreviewWorkbook({ resultSheetXml, rows: [ITEM] })).rows).toHaveLength(1)
  })

  test('DOCTYPE numa parte lida é recusado antes do parse', () => {
    const sharedStringsPrologue = '<!DOCTYPE sst [<!ENTITY a "aaaa">]>'
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM], sharedStringsPrologue })
    expect(codeOf(() => parse(bytes))).toBe('PREVIEW_NOT_A_WORKBOOK')
  })

  test('entrada cifrada ou zip64 não é planilha', () => {
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM] })
    expect(
      codeOf(() => parse(patchCentralDirectory(bytes, { entryName: SHEET_ENTRY, flags: 1 }))),
    ).toBe('PREVIEW_NOT_A_WORKBOOK')
    expect(codeOf(() => parse(markAsZip64(bytes)))).toBe('PREVIEW_NOT_A_WORKBOOK')
  })

  test('zip sem workbook.xml não é planilha', () => {
    expect(codeOf(() => parse(zipEntries({ 'a.txt': strToU8('x') })))).toBe(
      'PREVIEW_NOT_A_WORKBOOK',
    )
  })

  test('aba pedida que não existe é PREVIEW_SHEET_NOT_FOUND', () => {
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM], sheetName: 'OUTRA' })
    expect(codeOf(() => parse(bytes))).toBe('PREVIEW_SHEET_NOT_FOUND')
  })

  test('linha com dado depois da 5 000ª é recusada; 13 792 linhas reservadas vazias não', () => {
    const reserved = buildCargoPreviewWorkbook({ reservedEmptyRows: 13_788, rows: [ITEM] })
    expect(parse(reserved).rows).toHaveLength(1)
    const atLimit = buildCargoPreviewWorkbook({
      rows: [ITEM],
      rowsAt: [{ row: ITEM, rowNumber: 5_000 }],
    })
    expect(parse(atLimit).rows).toHaveLength(2)
    const far = buildCargoPreviewWorkbook({
      rows: [ITEM],
      rowsAt: [{ row: ITEM, rowNumber: 5_001 }],
    })
    expect(codeOf(() => parse(far))).toBe('PREVIEW_TOO_MANY_ROWS')
  })

  test('orçamento de tempo estourado aborta com PREVIEW_PARSE_TIMEOUT', () => {
    let now = 0
    const clock = (): number => {
      now += 1_000
      return now
    }
    const bytes = buildCargoPreviewWorkbook({ rows: [ITEM, ITEM, ITEM, ITEM, ITEM, ITEM] })
    expect(codeOf(() => parse(bytes, { clock }))).toBe('PREVIEW_PARSE_TIMEOUT')
  })

  test('strings compartilhadas e célula têm teto', () => {
    const rows = [ITEM, { ...ITEM, CompanyName: 'X'.repeat(50) }]
    const bytes = buildCargoPreviewWorkbook({ rows })
    expect(codeOf(() => parse(bytes, { limits: withLimits({ sharedStrings: 3 }) }))).toBe(
      'PREVIEW_TOO_MANY_STRINGS',
    )
    expect(codeOf(() => parse(bytes, { limits: withLimits({ cellTextLength: 40 }) }))).toBe(
      'PREVIEW_CELL_TOO_LONG',
    )
  })
})
