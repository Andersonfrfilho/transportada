import { describe, expect, it } from 'bun:test'

import {
  buildSpreadsheetLayout,
  SPREADSHEET_COLORS,
  SPREADSHEET_ROW_TONES,
  type SpreadsheetLegendItem,
} from '../../src/modules/shared/spreadsheet/spreadsheetLayout.service'

const MINIMUM_TEXT_CONTRAST = 4.5

const LEGEND: readonly SpreadsheetLegendItem[] = [
  { label: 'No galpão', tone: 'warehouse' },
  { label: 'Em rota', tone: 'on_route' },
  { label: 'Finalizada', tone: 'finished' },
  { label: 'Devolução total', tone: 'total_return' },
]

function linearize(channel: number): number {
  const ratio = channel / 255
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hexColor: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) =>
    linearize(Number.parseInt(hexColor.slice(start, start + 2), 16)),
  )
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter = 0, darker = 0] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((first, second) => second - first)
  return (lighter + 0.05) / (darker + 0.05)
}

function build(legend?: readonly SpreadsheetLegendItem[]) {
  return buildSpreadsheetLayout({
    columns: [
      { header: 'Viagem', width: 20 },
      { header: 'Situação', width: 20 },
    ],
    infoLines: ['CNPJ 11.222.333/0001-81'],
    ...(legend === undefined ? {} : { legend }),
    letterheadName: 'Transportadora Exemplo',
    rows: [{ cells: ['A', 'x'], tone: 'on_route' }],
    title: 'Relatório',
  })
}

describe('contraste dos tons', () => {
  it('a função de contraste confere com os extremos do WCAG', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })

  for (const [tone, color] of Object.entries(SPREADSHEET_ROW_TONES)) {
    it(`o texto da planilha sobre o tom ${tone} tem contraste de pelo menos 4,5:1`, () => {
      expect(contrastRatio(SPREADSHEET_COLORS.bodyText, color)).toBeGreaterThanOrEqual(
        MINIMUM_TEXT_CONTRAST,
      )
    })
  }
})

describe('legenda da planilha', () => {
  it('sem legenda o timbre não muda', () => {
    expect(build().letterheadRowCount).toBe(build([]).letterheadRowCount)
    expect(build().letterheadRowCount).toBe(4)
  })

  it('entra logo abaixo do título, uma linha por cor, com o rótulo recebido e a cor do tom', () => {
    const layout = build(LEGEND)
    const titleRow = 3
    const rows = layout.sheetData.slice(titleRow, titleRow + LEGEND.length)

    expect(layout.sheetData[titleRow - 1]?.[1]?.value).toBe('Relatório')
    expect(rows.map((row) => row[1]?.value)).toEqual(LEGEND.map((item) => item.label))
    expect(rows.map((row) => row[1]?.backgroundColor)).toEqual(
      LEGEND.map((item) => SPREADSHEET_ROW_TONES[item.tone]),
    )
    expect(rows.every((row) => row[1]?.textColor === SPREADSHEET_COLORS.bodyText)).toBe(true)
  })

  it('o timbre cresce pelas linhas da legenda e a tabela desce junto', () => {
    const layout = build(LEGEND)

    expect(layout.letterheadRowCount).toBe(4 + LEGEND.length)
    expect(layout.headerRowNumber).toBe(layout.letterheadRowCount + 1)
    expect(layout.sheetData[layout.headerRowNumber - 1]?.map((cell) => cell?.value)).toEqual([
      'Viagem',
      'Situação',
    ])
  })
})
