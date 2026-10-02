/** Copyright (c) 2026 Ada Technology. MIT License. */

/** Cores da planilha: o cabeçalho da tabela destaca-se do papel timbrado, e a zebra é discreta. */
export const SPREADSHEET_COLORS = {
  band: '#EAF1F5',
  border: '#C9D6DE',
  headerBackground: '#1F4E66',
  headerText: '#FFFFFF',
  muted: '#5B6B76',
  white: '#FFFFFF',
} as const

export type SpreadsheetColumn = Readonly<{
  align?: 'center' | 'left' | 'right'
  /** Formato do Excel (`#,##0`, `0.0`, `@`): números continuam somáveis. */
  format?: string
  header: string
  /** Largura em caracteres. */
  width: number
}>

export type SpreadsheetCellValue = number | string

export type SpreadsheetLayoutInput = Readonly<{
  columns: readonly SpreadsheetColumn[]
  /** Linhas do timbre abaixo do nome (CNPJ e endereço, telefone, exportação), já compostas. */
  infoLines: readonly string[]
  letterheadName: string
  rows: readonly (readonly SpreadsheetCellValue[])[]
  title: string
}>

type StyledCell = Readonly<Record<string, unknown> & { value: SpreadsheetCellValue }>
type SheetRow = readonly (StyledCell | null)[]

export type SpreadsheetLayout = Readonly<{
  columnOptions: readonly Readonly<{ width: number }>[]
  /** A linha do cabeçalho da tabela; tudo até ela fica congelado ao rolar. */
  headerRowNumber: number
  /** Linhas ocupadas pelo timbre: a imagem do logo cobre exatamente estas. */
  letterheadRowCount: number
  sheetData: readonly SheetRow[]
}>

const LETTERHEAD_BLANK_ROWS_AFTER = 1
const NAME_FONT_SIZE = 14
const TITLE_FONT_SIZE = 12
function padRow(cells: readonly (StyledCell | null)[], width: number): SheetRow {
  return Array.from({ length: width }, (_, index) => cells[index] ?? null)
}

function buildLetterheadRows(input: SpreadsheetLayoutInput): readonly SheetRow[] {
  const width = input.columns.length
  const span = Math.max(width - 1, 1)
  const textCell = (value: string, style: Record<string, unknown>): SheetRow =>
    padRow(
      [
        null,
        {
          alignVertical: 'center',
          columnSpan: span,
          textColor: SPREADSHEET_COLORS.muted,
          ...style,
          value,
        },
      ],
      width,
    )
  const lines = input.infoLines.filter((line) => line !== '')

  return [
    textCell(input.letterheadName, {
      fontSize: NAME_FONT_SIZE,
      fontWeight: 'bold',
      height: 24,
      textColor: SPREADSHEET_COLORS.headerBackground,
    }),
    ...lines.map((line) => textCell(line, { height: 16 })),
    textCell(input.title, {
      fontSize: TITLE_FONT_SIZE,
      fontWeight: 'bold',
      height: 22,
      textColor: SPREADSHEET_COLORS.headerBackground,
    }),
    ...Array.from({ length: LETTERHEAD_BLANK_ROWS_AFTER }, () => padRow([], width)),
  ]
}

function buildHeaderRow(columns: readonly SpreadsheetColumn[]): SheetRow {
  return columns.map((column) => ({
    align: column.align ?? 'left',
    alignVertical: 'center',
    backgroundColor: SPREADSHEET_COLORS.headerBackground,
    borderColor: SPREADSHEET_COLORS.headerBackground,
    borderStyle: 'thin',
    fontWeight: 'bold',
    height: 24,
    textColor: SPREADSHEET_COLORS.headerText,
    value: column.header,
    wrap: true,
  }))
}

function buildBodyRow(
  input: Readonly<{
    columns: readonly SpreadsheetColumn[]
    isBanded: boolean
    row: readonly SpreadsheetCellValue[]
  }>,
): SheetRow {
  return input.columns.map((column, index) => ({
    align: typeof input.row[index] === 'number' ? 'right' : (column.align ?? 'left'),
    alignVertical: 'center',
    backgroundColor: input.isBanded ? SPREADSHEET_COLORS.band : SPREADSHEET_COLORS.white,
    borderColor: SPREADSHEET_COLORS.border,
    borderStyle: 'thin',
    ...(column.format === undefined ? {} : { format: column.format }),
    value: input.row[index] ?? '',
    wrap: true,
  }))
}

/**
 * O timbre (logo, nome, dados da empresa, título e quem exportou) e, abaixo, a tabela: cabeçalho
 * em outra cor, zebra, bordas leves e larguras de coluna. Função pura — a biblioteca de planilha só
 * entra em `writeBrandedSpreadsheet`, com carga sob demanda.
 */
export function buildSpreadsheetLayout(input: SpreadsheetLayoutInput): SpreadsheetLayout {
  const letterhead = buildLetterheadRows(input)
  const header = buildHeaderRow(input.columns)
  const body = input.rows.map((row, index) =>
    buildBodyRow({ columns: input.columns, isBanded: index % 2 === 1, row }),
  )

  return {
    columnOptions: input.columns.map((column) => ({ width: column.width })),
    headerRowNumber: letterhead.length + 1,
    letterheadRowCount: letterhead.length,
    sheetData: [...letterhead, header, ...body],
  }
}

/** Decimal digitado com vírgula ou ponto vira número — a planilha soma e ordena, em vez de ler texto. */
export function toSpreadsheetNumber(value: string): SpreadsheetCellValue {
  const parsed = Number(value.replace(',', '.'))
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : value
}
