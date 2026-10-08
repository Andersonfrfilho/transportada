/** Copyright (c) 2026 Ada Technology. MIT License. */

/** Cores da planilha: o cabeçalho da tabela destaca-se do papel timbrado, e a zebra é discreta. */
export const SPREADSHEET_COLORS = {
  band: '#EAF1F5',
  bodyText: '#000000',
  border: '#C9D6DE',
  headerBackground: '#1F4E66',
  headerText: '#FFFFFF',
  muted: '#5B6B76',
  white: '#FFFFFF',
} as const

/** Chaves iguais às da situação da linha na API (`TRIP_REPORT_TONES`): as apps não compartilham código. */
export const SPREADSHEET_ROW_TONES = {
  finished: '#CDEBD3',
  on_route: '#E4D7F5',
  total_return: '#CFF1EE',
  warehouse: '#FFFFFF',
} as const

export type SpreadsheetRowTone = keyof typeof SPREADSHEET_ROW_TONES

export type SpreadsheetColumn = Readonly<{
  align?: 'center' | 'left' | 'right'
  /** Formato do Excel (`#,##0`, `0.0`, `@`): números continuam somáveis. */
  format?: string
  header: string
  /** Largura em caracteres. */
  width: number
}>

export type SpreadsheetCellValue = number | string

export type SpreadsheetToneRow = Readonly<{
  cells: readonly SpreadsheetCellValue[]
  tone?: SpreadsheetRowTone
}>

/** Formato antigo (só as células, zebra) ou com tom opcional. */
export type SpreadsheetRowInput = readonly SpreadsheetCellValue[] | SpreadsheetToneRow

export type SpreadsheetLegendItem = Readonly<{ label: string; tone: SpreadsheetRowTone }>

export type SpreadsheetLayoutInput = Readonly<{
  columns: readonly SpreadsheetColumn[]
  /** Linhas do timbre abaixo do nome (CNPJ e endereço, telefone, exportação), já compostas. */
  infoLines: readonly string[]
  /** Cores com o rótulo já traduzido, sob o título; o layout não fixa texto. */
  legend?: readonly SpreadsheetLegendItem[]
  letterheadName: string
  rows: readonly SpreadsheetRowInput[]
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
    ...(input.legend ?? []).map((item) =>
      textCell(item.label, {
        backgroundColor: SPREADSHEET_ROW_TONES[item.tone],
        borderColor: SPREADSHEET_COLORS.border,
        borderStyle: 'thin',
        height: 16,
        textColor: SPREADSHEET_COLORS.bodyText,
      }),
    ),
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

function isToneRow(row: SpreadsheetRowInput): row is SpreadsheetToneRow {
  return !Array.isArray(row)
}

function resolveRowBackground(
  input: Readonly<{ isBanded: boolean; tone: SpreadsheetRowTone | undefined }>,
): string {
  if (input.tone !== undefined) return SPREADSHEET_ROW_TONES[input.tone]
  return input.isBanded ? SPREADSHEET_COLORS.band : SPREADSHEET_COLORS.white
}

function buildBodyRow(
  input: Readonly<{
    columns: readonly SpreadsheetColumn[]
    isBanded: boolean
    row: readonly SpreadsheetCellValue[]
    tone: SpreadsheetRowTone | undefined
  }>,
): SheetRow {
  const backgroundColor = resolveRowBackground(input)

  return input.columns.map((column, index) => ({
    align: typeof input.row[index] === 'number' ? 'right' : (column.align ?? 'left'),
    alignVertical: 'center',
    backgroundColor,
    borderColor: SPREADSHEET_COLORS.border,
    borderStyle: 'thin',
    textColor: SPREADSHEET_COLORS.bodyText,
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
    buildBodyRow({
      columns: input.columns,
      isBanded: index % 2 === 1,
      row: isToneRow(row) ? row.cells : row,
      tone: isToneRow(row) ? row.tone : undefined,
    }),
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
