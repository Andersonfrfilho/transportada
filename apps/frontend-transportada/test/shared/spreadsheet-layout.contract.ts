/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

import {
  buildSpreadsheetLayout,
  toSpreadsheetNumber,
  SPREADSHEET_COLORS,
  type SpreadsheetColumn,
} from '../../src/modules/shared/spreadsheet/spreadsheetLayout.service'
import {
  composeLetterheadInfoLines,
  type LetterheadCompany,
} from '../../src/modules/shared/spreadsheet/spreadsheetLetterhead.service'

const COLUMNS: readonly SpreadsheetColumn[] = [
  { header: 'Produto', width: 30 },
  { align: 'right', format: '#,##0', header: 'Volumes', width: 12 },
]

const ROWS = [
  ['A', 10],
  ['B', 20],
  ['C', 30],
] as const

function build(infoLines: readonly string[] = ['CNPJ 11.222.333/0001-81', 'Rua A, 1']) {
  return buildSpreadsheetLayout({
    columns: COLUMNS,
    infoLines,
    letterheadName: 'Transportadora Exemplo',
    rows: ROWS,
    title: 'Caixas já medidas',
  })
}

function cellAt(layout: ReturnType<typeof build>, row: number, column: number) {
  return layout.sheetData[row - 1]?.[column]
}

describe('o timbre da planilha', () => {
  it('abre com o nome da empresa, os dados, o título e uma linha em branco, a partir da 2ª coluna', () => {
    const layout = build()

    expect(cellAt(layout, 1, 0)).toBeNull()
    expect(cellAt(layout, 1, 1)?.value).toBe('Transportadora Exemplo')
    expect(cellAt(layout, 2, 1)?.value).toBe('CNPJ 11.222.333/0001-81')
    expect(cellAt(layout, 3, 1)?.value).toBe('Rua A, 1')
    expect(cellAt(layout, 4, 1)?.value).toBe('Caixas já medidas')
    expect(layout.letterheadRowCount).toBe(5)
    expect(layout.sheetData[4]?.every((cell) => cell === null)).toBe(true)
  })

  it('o texto do timbre ocupa as colunas à direita do logo', () => {
    expect(cellAt(build(), 1, 1)).toMatchObject({ columnSpan: COLUMNS.length - 1 })
  })

  it('sem dados da empresa o timbre encolhe, e a tabela desce junto', () => {
    const layout = build([])

    expect(layout.letterheadRowCount).toBe(3)
    expect(layout.headerRowNumber).toBe(4)
  })
})

describe('a tabela da planilha', () => {
  it('o cabeçalho tem cor própria, diferente do corpo e do timbre', () => {
    const layout = build()
    const header = layout.sheetData[layout.headerRowNumber - 1]

    expect(header?.map((cell) => cell?.value)).toEqual(['Produto', 'Volumes'])
    for (const cell of header ?? []) {
      expect(cell).toMatchObject({
        backgroundColor: SPREADSHEET_COLORS.headerBackground,
        fontWeight: 'bold',
        textColor: SPREADSHEET_COLORS.headerText,
      })
    }
  })

  it('o corpo é zebrado: a primeira linha é branca, a segunda tem faixa, a terceira volta ao branco', () => {
    const layout = build()
    const first = layout.headerRowNumber + 1

    expect(cellAt(layout, first, 0)?.backgroundColor).toBe(SPREADSHEET_COLORS.white)
    expect(cellAt(layout, first + 1, 0)?.backgroundColor).toBe(SPREADSHEET_COLORS.band)
    expect(cellAt(layout, first + 2, 0)?.backgroundColor).toBe(SPREADSHEET_COLORS.white)
  })

  it('número sai alinhado à direita e com o formato da coluna, para somar na planilha', () => {
    const layout = build()
    const cell = cellAt(layout, layout.headerRowNumber + 1, 1)

    expect(cell).toMatchObject({ align: 'right', format: '#,##0', value: 10 })
  })

  it('a largura de cada coluna vai para a planilha, e o congelamento termina no cabeçalho', () => {
    const layout = build()

    expect(layout.columnOptions).toEqual([{ width: 30 }, { width: 12 }])
    expect(layout.headerRowNumber).toBe(layout.letterheadRowCount + 1)
  })

  it('todas as linhas da tabela entram, na ordem recebida', () => {
    const layout = build()
    const body = layout.sheetData.slice(layout.headerRowNumber)

    expect(body.map((row) => row[0]?.value)).toEqual(['A', 'B', 'C'])
  })
})

describe('as linhas de informação do timbre', () => {
  const company: LetterheadCompany = {
    address: 'Rua A, 1 · Centro · Cidade/SP · 01000-000',
    name: 'Transportadora Exemplo',
    phone: '(11) 1234-5678',
    taxId: '11.222.333/0001-81',
  }
  const labels = { phone: 'Tel.', taxId: 'CNPJ' }

  it('junta CNPJ e telefone, o endereço, e quando e por quem saiu', () => {
    expect(
      composeLetterheadInfoLines({
        company,
        exportedBy: 'Por Maria',
        exportedOn: 'Exportado em 02/10/2026 18:00',
        labels,
      }),
    ).toEqual([
      'CNPJ 11.222.333/0001-81  ·  Tel. (11) 1234-5678',
      'Rua A, 1 · Centro · Cidade/SP · 01000-000',
      'Exportado em 02/10/2026 18:00  ·  Por Maria',
    ])
  })

  it('empresa sem CNPJ, telefone e endereço não deixa linha vazia nem "undefined"', () => {
    const lines = composeLetterheadInfoLines({
      company: { address: '', name: 'X', phone: '', taxId: '' },
      exportedBy: 'Por Maria',
      exportedOn: 'Exportado em 02/10/2026',
      labels,
    })

    expect(lines).toEqual(['Exportado em 02/10/2026  ·  Por Maria'])
  })
})

describe('toda exportação em Excel passa pelo mesmo caminho', () => {
  const MODULES = new URL('../../src/modules/', import.meta.url)
  /** Importação de verdade, estática ou dinâmica — comentário que cita o nome não conta. */
  const IMPORTS_SPREADSHEET_LIBRARY = /(?:from|import\()\s*['"]write-excel-file/

  it('só o writer compartilhado conhece a biblioteca de planilha, e a carrega sob demanda', () => {
    const offenders: string[] = []
    const visit = (directory: string): void => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) visit(path)
        else if (
          /\.(ts|tsx)$/.test(name) &&
          IMPORTS_SPREADSHEET_LIBRARY.test(readFileSync(path, 'utf8'))
        ) {
          offenders.push(path.slice(MODULES.pathname.length))
        }
      }
    }
    visit(MODULES.pathname)

    expect(offenders.filter((path) => !path.includes('spreadsheet/'))).toEqual([])
    const writer = readFileSync(
      new URL('shared/spreadsheet/writeBrandedSpreadsheet.service.ts', MODULES),
      'utf8',
    )
    expect(writer).toInclude("import('write-excel-file/browser')")
  })
})

describe('toSpreadsheetNumber', () => {
  it('lê decimal com vírgula ou ponto como número, e deixa texto e vazio como estão', () => {
    expect(toSpreadsheetNumber('2,692')).toBe(2.692)
    expect(toSpreadsheetNumber('703.97')).toBe(703.97)
    expect(toSpreadsheetNumber('0')).toBe(0)
    expect(toSpreadsheetNumber('')).toBe('')
    expect(toSpreadsheetNumber('ABC')).toBe('ABC')
    expect(toSpreadsheetNumber('1,2,3')).toBe('1,2,3')
  })
})
