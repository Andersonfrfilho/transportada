/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.6 (RF19): PDF do resultado, para imprimir ou enviar ao contador. Desenha o `ExpenseExportDocument`, o
 * mesmo que a planilha lê; nenhum número é calculado aqui.
 */
import PDFDocument from 'pdfkit'

import {
  COST_GROUP_LABELS,
  CRITERION_LABELS,
  formatCalculatedAt,
  formatCivilDate,
  formatMoneyBrl,
  type ExpenseExportDocument,
  type ExpenseExportRow,
} from '../domain/expense-result-export.policy.js'

const MARGIN = 36
const WIDTH = 523
const BOTTOM = 800
const ROW_HEIGHT = 14
const FONT = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'

type Column = { readonly align: 'left' | 'right'; readonly title: string; readonly width: number }

const TRIP_COLUMNS: readonly Column[] = [
  { align: 'left', title: 'Viagem', width: 52 },
  { align: 'left', title: 'Concluída', width: 56 },
  { align: 'left', title: 'Veículo', width: 56 },
  { align: 'left', title: 'Cliente', width: 99 },
  { align: 'right', title: 'Frete', width: 52 },
  { align: 'right', title: 'Custo', width: 52 },
  { align: 'right', title: 'Rat. veíc.', width: 52 },
  { align: 'right', title: 'Rat. geral', width: 52 },
  { align: 'right', title: 'Margem', width: 52 },
]

const GROUP_COLUMNS = (title: string): readonly Column[] => [
  { align: 'left', title, width: 143 },
  { align: 'right', title: 'Frete', width: 76 },
  { align: 'right', title: 'Custo', width: 76 },
  { align: 'right', title: 'Rat. veículo', width: 76 },
  { align: 'right', title: 'Rat. geral', width: 76 },
  { align: 'right', title: 'Margem', width: 76 },
]

const money = (value: string): string => formatMoneyBrl(value).replace('R$ ', '')

function collect(doc: PDFKit.PDFDocument): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    doc.on('error', reject)
  })
}

export function renderExpenseResultPdf(document: ExpenseExportDocument): Promise<Uint8Array> {
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4' })
  const done = collect(doc)

  const ensure = (height: number): void => {
    if (doc.y + height > BOTTOM) doc.addPage()
  }
  const text = (value: string, options?: PDFKit.Mixins.TextOptions): void => {
    doc
      .font(FONT)
      .fontSize(9)
      .text(value, MARGIN, doc.y, { width: WIDTH, ...options })
  }
  const heading = (value: string): void => {
    ensure(40)
    doc.moveDown(0.8)
    doc.font(FONT_BOLD).fontSize(11).text(value, MARGIN, doc.y, { width: WIDTH })
    doc.moveDown(0.3)
  }
  const tableRow = (columns: readonly Column[], cells: readonly string[], bold: boolean): void => {
    ensure(ROW_HEIGHT + 2)
    const top = doc.y
    let x = MARGIN
    columns.forEach((column, index) => {
      doc
        .font(bold ? FONT_BOLD : FONT)
        .fontSize(7.5)
        .text(cells[index] ?? '', x + 1, top, {
          align: column.align,
          ellipsis: true,
          height: ROW_HEIGHT - 2,
          lineBreak: false,
          width: column.width - 4,
        })
      x += column.width
    })
    doc.y = top + ROW_HEIGHT
  }
  const table = (columns: readonly Column[], rows: readonly (readonly string[])[]): void => {
    tableRow(
      columns,
      columns.map((column) => column.title),
      true,
    )
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + WIDTH, doc.y)
      .strokeColor('#999999')
      .stroke()
    doc.y += 2
    for (const cells of rows) tableRow(columns, cells, false)
  }
  const groupRows = (rows: readonly ExpenseExportRow[]): string[][] =>
    rows.map((row) => [
      row.label,
      money(row.revenue),
      money(row.cost),
      money(row.vehicleShare),
      money(row.generalShare),
      money(row.margin),
    ])

  doc.font(FONT_BOLD).fontSize(15).text('Resultado das contas', MARGIN, MARGIN)
  doc.moveDown(0.4)
  text(document.companyName)
  text(`Período: ${formatCivilDate(document.from)} a ${formatCivilDate(document.to)}`)
  text(`Filtros: ${document.filters.length === 0 ? 'nenhum' : document.filters.join(' | ')}`)
  text(
    `Critério de rateio: ${(Object.keys(COST_GROUP_LABELS) as (keyof typeof COST_GROUP_LABELS)[])
      .map((group) => `${COST_GROUP_LABELS[group]} ${CRITERION_LABELS[document.settings[group]]}`)
      .join('; ')}`,
  )
  text(`Calculado em ${formatCalculatedAt(document.calculatedAt)}`)

  heading('Indicadores')
  const indicators: readonly (readonly [string, string])[] = [
    ['Faturamento', document.totals.revenue],
    ['Custo das viagens', document.totals.tripCost],
    ['Contas do período', document.totals.expensesTotal],
    ['Resultado', document.totals.profit],
    ['Contas não rateadas', document.unallocatedTotal],
  ]
  for (const [label, value] of indicators) {
    ensure(ROW_HEIGHT)
    const top = doc.y
    doc.font(FONT).fontSize(9).text(label, MARGIN, top, { width: 200 })
    doc
      .font(FONT_BOLD)
      .fontSize(9)
      .text(formatMoneyBrl(value), MARGIN + 200, top, { align: 'right', width: 120 })
    doc.y = top + ROW_HEIGHT
  }

  heading('Por viagem')
  table(
    TRIP_COLUMNS,
    document.byTrip.map((trip) => [
      trip.label,
      trip.completedOn === undefined ? '' : formatCivilDate(trip.completedOn),
      trip.vehicle ?? '',
      trip.customer ?? '',
      money(trip.revenue),
      money(trip.cost),
      money(trip.vehicleShare),
      money(trip.generalShare),
      money(trip.margin),
    ]),
  )
  heading('Por veículo')
  table(GROUP_COLUMNS('Veículo'), groupRows(document.byVehicle))
  heading('Por cliente')
  table(GROUP_COLUMNS('Cliente'), groupRows(document.byCustomer))

  if (document.unallocated.length > 0) {
    heading('Contas não rateadas')
    for (const item of document.unallocated) {
      ensure(ROW_HEIGHT)
      text(`${item.name}: ${formatMoneyBrl(item.amount)} (${item.reason})`)
    }
  }

  doc.end()
  return done
}
