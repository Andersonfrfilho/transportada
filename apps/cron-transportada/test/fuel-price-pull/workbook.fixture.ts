/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildZipArchive } from './xlsx-writer.fixture.js'

/**
 * Reprodução da aba `ESTADOS` do `resumo_semanal.xlsx` sondado em T000: mesmas linhas de preâmbulo
 * com os mesmos buracos de numeração (`r` pula 4, 5 e 9), cabeçalho em `r="10"`, dados a partir de
 * `r="11"` e uma linha estilizada vazia no fim. Os textos e os números de `ANP_ESTADOS_ROWS` são os
 * medidos, salvo `GASOLINA COMUM`, `GASOLINA ADITIVADA`, `GLP` e a linha do ESPÍRITO SANTO, cujos
 * valores não foram capturados em T000 — a forma é real, o preço é plausível.
 */

const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const

export const ANP_HEADER_LABELS = [
  'DATA INICIAL',
  'DATA FINAL',
  'REGIAO',
  'ESTADOS',
  'PRODUTO',
  'NÚMERO DE POSTOS PESQUISADOS',
  'UNIDADE DE MEDIDA',
  'PREÇO MÉDIO REVENDA',
  'DESVIO PADRÃO REVENDA',
  'PREÇO MÍNIMO REVENDA',
  'PREÇO MÁXIMO REVENDA',
  'COEF DE VARIAÇÃO REVENDA',
] as const

/** Seriais Excel de época 1899-12-30: domingo 2026-08-09 a sábado 2026-08-15. */
export const ANP_WEEK_ENDING_SERIAL = 46249
export const ANP_WEEK_STARTING_SERIAL = 46243

const HEADER_ROW = 10
const OBSERVATION =
  "OBS: ATUALMENTE, O PRODUTO 'ÓLEO DIESEL' SE REFERE AO ÓLEO DIESEL B S500 COMUM."
const PREAMBLE_ROWS = [
  {
    column: 'A',
    row: 1,
    text: 'AGÊNCIA NACIONAL DO PETRÓLEO, GÁS NATURAL E BIOCOMBUSTÍVEIS - ANP',
  },
  { column: 'A', row: 2, text: 'SUPERINTENDÊNCIA DE DEFESA DA CONCORRÊNCIA' },
  { column: 'A', row: 3, text: 'LEVANTAMENTO DE PREÇOS DE COMBUSTÍVEIS' },
  { column: 'A', row: 6, text: 'INTERVALO DE TEMPO: SEMANAL' },
  { column: 'A', row: 7, text: 'COMBUSTÍVEL: TODOS' },
  { column: 'A', row: 8, text: 'TIPO RELATÓRIO: ESTADOS' },
  { column: 'E', row: 8, text: OBSERVATION },
] as const

/** Colunas que a coleta não lê, com os ruídos reais — inclusive o coeficiente em notação científica. */
const MAXIMUM_PRICE = '6.6'
const MINIMUM_PRICE = '4.6500000000000004'
const STANDARD_DEVIATION = '0.68799999999999994'
const VARIATION_COEFFICIENT = '4.9000000000000002E-2'

export type AnpSheetRow = {
  readonly averagePrice: string
  readonly product: string
  readonly region: string
  readonly state: string
  readonly stationCount: number
  readonly unit: string
}

export const ANP_ESTADOS_ROWS: readonly AnpSheetRow[] = [
  {
    averagePrice: '5',
    product: 'ETANOL HIDRATADO',
    region: 'NORTE',
    state: 'ACRE',
    stationCount: 10,
    unit: 'R$/l',
  },
  {
    averagePrice: '5.01',
    product: 'ETANOL HIDRATADO',
    region: 'NORDESTE',
    state: 'ALAGOAS',
    stationCount: 53,
    unit: 'R$/l',
  },
  {
    averagePrice: '6.29',
    product: 'GASOLINA COMUM',
    region: 'NORDESTE',
    state: 'ALAGOAS',
    stationCount: 61,
    unit: 'R$/l',
  },
  {
    averagePrice: '6.99',
    product: 'GASOLINA ADITIVADA',
    region: 'NORDESTE',
    state: 'ALAGOAS',
    stationCount: 58,
    unit: 'R$/l',
  },
  {
    averagePrice: '112.5',
    product: 'GLP',
    region: 'NORDESTE',
    state: 'ALAGOAS',
    stationCount: 24,
    unit: 'R$/13kg',
  },
  {
    averagePrice: '4.3899999999999997',
    product: 'GNV',
    region: 'NORDESTE',
    state: 'ALAGOAS',
    stationCount: 13,
    unit: 'R$/m³',
  },
  {
    averagePrice: '4.99',
    product: 'GNV',
    region: 'NORTE',
    state: 'AMAZONAS',
    stationCount: 1,
    unit: 'R$/m³',
  },
  {
    averagePrice: '7.9',
    product: 'OLEO DIESEL',
    region: 'NORTE',
    state: 'ACRE',
    stationCount: 10,
    unit: 'R$/l',
  },
  {
    averagePrice: '6.89',
    product: 'OLEO DIESEL S10',
    region: 'SUDESTE',
    state: 'SAO PAULO',
    stationCount: 833,
    unit: 'R$/l',
  },
  {
    averagePrice: '6.7299999999999995',
    product: 'OLEO DIESEL S10',
    region: 'SUDESTE',
    state: 'ESPIRITO SANTO',
    stationCount: 141,
    unit: 'R$/l',
  },
]

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function internString(input: { readonly pool: string[]; readonly text: string }): number {
  const existing = input.pool.indexOf(input.text)
  if (existing >= 0) return existing

  input.pool.push(input.text)
  return input.pool.length - 1
}

function textCell(input: {
  readonly column: string
  readonly pool: string[]
  readonly row: number
  readonly text: string
}): string {
  const index = internString({ pool: input.pool, text: input.text })
  return `<c r="${input.column}${input.row}" s="3" t="s"><v>${index}</v></c>`
}

function numberCell(input: {
  readonly column: string
  readonly row: number
  readonly value: string
}): string {
  return `<c r="${input.column}${input.row}" s="6"><v>${input.value}</v></c>`
}

function buildDataRowXml(input: {
  readonly pool: string[]
  readonly row: AnpSheetRow
  readonly rowNumber: number
  readonly weekEndingSerial: number
  readonly weekStartingSerial: number
}): string {
  const { pool, row, rowNumber } = input
  const text = (column: string, value: string): string =>
    textCell({ column, pool, row: rowNumber, text: value })
  const number = (column: string, value: string): string =>
    numberCell({ column, row: rowNumber, value })

  return [
    `<row r="${rowNumber}" spans="1:12">`,
    number('A', String(input.weekStartingSerial)),
    number('B', String(input.weekEndingSerial)),
    text('C', row.region),
    text('D', row.state),
    text('E', row.product),
    number('F', String(row.stationCount)),
    text('G', row.unit),
    number('H', row.averagePrice),
    number('I', STANDARD_DEVIATION),
    number('J', MINIMUM_PRICE),
    number('K', MAXIMUM_PRICE),
    number('L', VARIATION_COEFFICIENT),
    '</row>',
  ].join('')
}

function buildPreambleXml(input: {
  readonly extraPreambleRow: string | undefined
  readonly pool: string[]
}): string {
  const grouped = new Map<number, string[]>()

  for (const cell of PREAMBLE_ROWS) {
    const cells = grouped.get(cell.row) ?? []
    cells.push(textCell({ column: cell.column, pool: input.pool, row: cell.row, text: cell.text }))
    grouped.set(cell.row, cells)
  }
  if (input.extraPreambleRow !== undefined) {
    grouped.set(9, [
      textCell({ column: 'A', pool: input.pool, row: 9, text: input.extraPreambleRow }),
    ])
  }

  return [...grouped.entries()]
    .map(([row, cells]) => `<row r="${row}" spans="1:12">${cells.join('')}</row>`)
    .join('')
}

function buildEstadosSheetXml(input: {
  readonly extraPreambleRow: string | undefined
  readonly headerLabels: readonly string[]
  readonly rows: readonly AnpSheetRow[]
  readonly weekEndingSerial: number
  readonly weekStartingSerial: number
}): { readonly sharedStrings: readonly string[]; readonly xml: string } {
  const pool: string[] = []
  const preamble = buildPreambleXml({ extraPreambleRow: input.extraPreambleRow, pool })
  const headerRow = input.extraPreambleRow === undefined ? HEADER_ROW : HEADER_ROW + 1
  const header = input.headerLabels
    .map((label, index) =>
      textCell({ column: COLUMNS[index] ?? 'M', pool, row: headerRow, text: label }),
    )
    .join('')
  const data = input.rows
    .map((row, index) =>
      buildDataRowXml({
        pool,
        row,
        rowNumber: headerRow + 1 + index,
        weekEndingSerial: input.weekEndingSerial,
        weekStartingSerial: input.weekStartingSerial,
      }),
    )
    .join('')
  const trailingRow = headerRow + 1 + input.rows.length
  const trailing = `<row r="${trailingRow}" spans="1:12">${COLUMNS.map((column) => `<c r="${column}${trailingRow}" s="5"/>`).join('')}</row>`

  return {
    sharedStrings: pool,
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${preamble}<row r="${headerRow}" spans="1:12">${header}</row>${data}${trailing}</sheetData></worksheet>`,
  }
}

function buildSharedStringsXml(pool: readonly string[]): string {
  const items = pool
    .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${pool.length}" uniqueCount="${pool.length}">${items}</sst>`
}

/** A ordem das abas e a das relações divergem de propósito: o alvo sai do `rels`, não do índice. */
function buildSheetPlan(shouldSwapSheetTargets: boolean): readonly {
  readonly file: string
  readonly name: string
  readonly relationshipId: string
}[] {
  const estadosFile = shouldSwapSheetTargets ? 'sheet5.xml' : 'sheet3.xml'
  const brasilFile = shouldSwapSheetTargets ? 'sheet3.xml' : 'sheet5.xml'

  return [
    { file: 'sheet1.xml', name: 'CAPITAIS', relationshipId: 'rId1' },
    { file: 'sheet2.xml', name: 'MUNICIPIOS', relationshipId: 'rId2' },
    { file: estadosFile, name: 'ESTADOS', relationshipId: 'rId3' },
    { file: 'sheet4.xml', name: 'REGIOES', relationshipId: 'rId4' },
    { file: brasilFile, name: 'BRASIL', relationshipId: 'rId5' },
  ]
}

const EMPTY_SHEET_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'
const RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

export function buildAnpWorkbook(input?: {
  readonly extraPreambleRow?: string
  readonly headerLabels?: readonly string[]
  readonly rows?: readonly AnpSheetRow[]
  readonly shouldSwapSheetTargets?: boolean
  readonly weekEndingSerial?: number
  readonly weekStartingSerial?: number
}): Uint8Array {
  const plan = buildSheetPlan(input?.shouldSwapSheetTargets ?? false)
  const estados = buildEstadosSheetXml({
    extraPreambleRow: input?.extraPreambleRow,
    headerLabels: input?.headerLabels ?? ANP_HEADER_LABELS,
    rows: input?.rows ?? ANP_ESTADOS_ROWS,
    weekEndingSerial: input?.weekEndingSerial ?? ANP_WEEK_ENDING_SERIAL,
    weekStartingSerial: input?.weekStartingSerial ?? ANP_WEEK_STARTING_SERIAL,
  })
  const estadosFile = plan.find((sheet) => sheet.name === 'ESTADOS')?.file ?? 'sheet3.xml'
  const sheetEntries = plan.map((sheet) => ({
    content: sheet.file === estadosFile ? estados.xml : EMPTY_SHEET_XML,
    name: `xl/worksheets/${sheet.file}`,
  }))
  const overrides = plan
    .map(
      (sheet) =>
        `<Override PartName="/xl/worksheets/${sheet.file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')
  const sheets = plan
    .map(
      (sheet) =>
        `<sheet name="${sheet.name}" sheetId="${sheet.relationshipId.slice(3)}" r:id="${sheet.relationshipId}"/>`,
    )
    .join('')
  const relationships = [plan[2], plan[0], plan[4], plan[3], plan[1]]
    .filter((sheet) => sheet !== undefined)
    .map(
      (sheet) =>
        `<Relationship Id="${sheet.relationshipId}" Type="${RELATIONSHIP_NAMESPACE}/worksheet" Target="worksheets/${sheet.file}"/>`,
    )
    .join('')

  return buildZipArchive({
    entries: [
      {
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
        name: '[Content_Types].xml',
      },
      {
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELATIONSHIP_NAMESPACE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        name: '_rels/.rels',
      },
      {
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RELATIONSHIP_NAMESPACE}"><sheets>${sheets}</sheets></workbook>`,
        name: 'xl/workbook.xml',
      },
      {
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId6" Type="${RELATIONSHIP_NAMESPACE}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
        name: 'xl/_rels/workbook.xml.rels',
      },
      { content: buildSharedStringsXml(estados.sharedStrings), name: 'xl/sharedStrings.xml' },
      ...sheetEntries,
    ],
  })
}
