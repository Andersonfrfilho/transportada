import { describe, expect, it } from 'bun:test'

import {
  buildSpreadsheetLayout,
  SPREADSHEET_COLORS,
  SPREADSHEET_ROW_TONES,
  type SpreadsheetRowInput,
} from '../../src/modules/shared/spreadsheet/spreadsheetLayout.service'

const COLUMNS = [
  { header: 'Viagem', width: 20 },
  { align: 'right', format: '#,##0', header: 'Volumes', width: 12 },
] as const

function buildBody(rows: readonly SpreadsheetRowInput[]) {
  const layout = buildSpreadsheetLayout({
    columns: COLUMNS,
    infoLines: [],
    letterheadName: 'Transportadora Exemplo',
    rows,
    title: 'Relatório',
  })
  return layout.sheetData.slice(layout.headerRowNumber)
}

describe('cor por linha da planilha', () => {
  it('declara os quatro tons com as chaves da situação da API', () => {
    expect(SPREADSHEET_ROW_TONES).toEqual({
      finished: '#CDEBD3',
      on_route: '#E4D7F5',
      total_return: '#CFF1EE',
      warehouse: '#FFFFFF',
    })
  })

  it('linha com tom pinta todas as células com a cor do tom, sem zebra', () => {
    const body = buildBody([
      { cells: ['A', 1], tone: 'on_route' },
      { cells: ['B', 2], tone: 'finished' },
      { cells: ['C', 3], tone: 'total_return' },
      { cells: ['D', 4], tone: 'warehouse' },
    ])

    expect(body.map((row) => row.map((cell) => cell?.backgroundColor))).toEqual([
      [SPREADSHEET_ROW_TONES.on_route, SPREADSHEET_ROW_TONES.on_route],
      [SPREADSHEET_ROW_TONES.finished, SPREADSHEET_ROW_TONES.finished],
      [SPREADSHEET_ROW_TONES.total_return, SPREADSHEET_ROW_TONES.total_return],
      [SPREADSHEET_ROW_TONES.warehouse, SPREADSHEET_ROW_TONES.warehouse],
    ])
  })

  it('linha sem tom mantém a zebra, no formato novo e no antigo', () => {
    const body = buildBody([{ cells: ['A', 1] }, ['B', 2], { cells: ['C', 3] }])

    expect(body.map((row) => row[0]?.backgroundColor)).toEqual([
      SPREADSHEET_COLORS.white,
      SPREADSHEET_COLORS.band,
      SPREADSHEET_COLORS.white,
    ])
    expect(body.map((row) => row[0]?.value)).toEqual(['A', 'B', 'C'])
  })

  it('o tom não muda valor, alinhamento nem formato da célula', () => {
    const [row] = buildBody([{ cells: ['A', 10], tone: 'on_route' }])

    expect(row?.[1]).toMatchObject({ align: 'right', format: '#,##0', value: 10 })
  })

  it('a posição na zebra segue o índice da linha mesmo com linhas tonalizadas no meio', () => {
    const body = buildBody([['A', 1], { cells: ['B', 2], tone: 'finished' }, ['C', 3], ['D', 4]])

    expect(body.map((row) => row[0]?.backgroundColor)).toEqual([
      SPREADSHEET_COLORS.white,
      SPREADSHEET_ROW_TONES.finished,
      SPREADSHEET_COLORS.white,
      SPREADSHEET_COLORS.band,
    ])
  })
})
