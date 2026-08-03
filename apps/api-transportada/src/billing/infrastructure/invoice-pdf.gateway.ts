/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import PDFDocument from 'pdfkit'

import {
  buildInvoiceLayout,
  buildInvoiceRowCells,
  formatInvoiceDate,
  INVOICE_TABLE_COLUMNS,
  type InvoiceLayout,
  type InvoiceLayoutBlock,
  type InvoiceLayoutInvoice,
  type InvoiceLayoutPage,
  type InvoiceLayoutProfile,
  type InvoiceLayoutReportRow,
} from '../domain/invoice-layout.policy.js'

const PAGE_MARGIN = 36
const CONTENT_WIDTH = 523
const FONT_REGULAR = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const RULE_COLOR = '#999999'
const TEXT_COLOR = '#000000'
const HEADER_TOP = 36
const TABLE_HEADER_TOP = 172
const TABLE_TOP = 186
const TABLE_ROW_HEIGHT = 12
const CELL_PADDING = 4
const CLOSING_GAP = 8
const CLOSING_LINE_HEIGHT = 14
const FOOTER_OFFSET = 28
const OBSERVATIONS_TITLE = 'OBSERVAÇÕES'
const OBSERVATIONS_TITLE_HEIGHT = 11
const SEPARATOR = ' · '
const LOGO_BOX_WIDTH = 132
const LOGO_BOX_HEIGHT = 54
const LOGO_TEXT_GAP = 12

/** Última linha ocupa até 702pt, bem acima do rodapé em 814pt — o bloco de fechamento cabe mesmo com a página cheia. */
export const INVOICE_PDF_ROWS_PER_PAGE = 43

export type InvoicePdfLogo = {
  readonly bytes: Buffer
}

export type InvoicePdfRenderInput = {
  readonly invoice: InvoiceLayoutInvoice
  readonly logo?: InvoicePdfLogo | null
  readonly observations: string
  readonly printedAt: Date
  readonly profile: InvoiceLayoutProfile | null
  readonly rows: readonly InvoiceLayoutReportRow[]
}

export type InvoicePdfDocument = {
  readonly bytes: Buffer
  readonly pageCount: number
}

export type InvoicePdfGateway = {
  readonly render: (input: InvoicePdfRenderInput) => Promise<InvoicePdfDocument>
}

export type CreateInvoicePdfGatewayOptions = {
  readonly compress?: boolean
}

export function createInvoicePdfGateway(
  options?: CreateInvoicePdfGatewayOptions,
): InvoicePdfGateway {
  return {
    render: async (input) => {
      const layout = buildInvoiceLayout({
        invoice: input.invoice,
        observations: input.observations,
        profile: input.profile,
        rows: input.rows,
        rowsPerPage: INVOICE_PDF_ROWS_PER_PAGE,
      })

      const document = new PDFDocument({
        bufferPages: true,
        compress: options?.compress ?? true,
        margin: PAGE_MARGIN,
        size: 'A4',
      })
      document.info.CreationDate = input.printedAt
      document.info.Title = `Fatura ${input.invoice.invoiceNumber}`

      for (const page of layout.pages) {
        if (page.pageNumber > 1) document.addPage()
        drawPageHeader({ document, layout, logo: input.logo ?? null })
        drawRows({ document, page })
      }
      drawClosing({ document, layout })

      const pageCount = stampFooters({
        document,
        invoiceNumber: input.invoice.invoiceNumber,
        printedAt: input.printedAt,
      })

      return { bytes: await renderToBuffer(document), pageCount }
    },
  }
}

function drawPageHeader(input: {
  readonly document: PDFKit.PDFDocument
  readonly layout: InvoiceLayout
  readonly logo: InvoicePdfLogo | null
}): void {
  const { document, layout, logo } = input
  const { carrier } = layout
  const identityWidth =
    logo === null ? CONTENT_WIDTH : CONTENT_WIDTH - LOGO_BOX_WIDTH - LOGO_TEXT_GAP
  const identityOptions = { ellipsis: true, lineBreak: false, width: identityWidth } as const

  drawLogo({ document, logo })
  document.fillColor(TEXT_COLOR)
  document.font(FONT_BOLD).fontSize(13)
  document.text(carrier.legalName, PAGE_MARGIN, HEADER_TOP, identityOptions)
  document.font(FONT_REGULAR).fontSize(9)
  document.text(carrier.tradeName, PAGE_MARGIN, HEADER_TOP + 18, identityOptions)
  document.fontSize(8)
  document.text(carrier.taxLine, PAGE_MARGIN, HEADER_TOP + 32, identityOptions)
  document.text(carrier.addressLine, PAGE_MARGIN, HEADER_TOP + 42, identityOptions)
  document.text(carrier.contactLine, PAGE_MARGIN, HEADER_TOP + 52, identityOptions)

  drawRule({ document, y: HEADER_TOP + 66 })
  drawBlock({ block: layout.invoice, columns: 4, document, y: HEADER_TOP + 72 })
  drawBlock({ block: layout.customer, columns: 2, document, y: HEADER_TOP + 102 })
  drawRule({ document, y: HEADER_TOP + 130 })
  drawTableHeader(document)
}

/** Uma imagem corrompida não pode derrubar a fatura: o logo é decoração, o documento fiscal é o entregável. */
function drawLogo(input: {
  readonly document: PDFKit.PDFDocument
  readonly logo: InvoicePdfLogo | null
}): void {
  if (input.logo === null) return
  try {
    input.document.image(
      input.logo.bytes,
      PAGE_MARGIN + CONTENT_WIDTH - LOGO_BOX_WIDTH,
      HEADER_TOP,
      { align: 'right', fit: [LOGO_BOX_WIDTH, LOGO_BOX_HEIGHT] },
    )
  } catch {
    return
  }
}

function drawBlock(input: {
  readonly block: InvoiceLayoutBlock
  readonly columns: number
  readonly document: PDFKit.PDFDocument
  readonly y: number
}): void {
  const { block, columns, document, y } = input
  const columnWidth = CONTENT_WIDTH / columns

  document.font(FONT_BOLD).fontSize(8)
  document.text(block.title, PAGE_MARGIN, y, { lineBreak: false })
  document.font(FONT_REGULAR).fontSize(9)
  block.fields.forEach((field, index) => {
    document.text(`${field.label}: ${field.value}`, PAGE_MARGIN + index * columnWidth, y + 13, {
      ellipsis: true,
      lineBreak: false,
      width: columnWidth - CELL_PADDING,
    })
  })
}

function drawTableHeader(document: PDFKit.PDFDocument): void {
  document.font(FONT_BOLD).fontSize(7)
  let x = PAGE_MARGIN
  for (const column of INVOICE_TABLE_COLUMNS) {
    document.text(column.label, x, TABLE_HEADER_TOP, {
      align: column.align,
      ellipsis: true,
      lineBreak: false,
      width: column.width - CELL_PADDING,
    })
    x += column.width
  }
  drawRule({ document, y: TABLE_TOP - 6 })
}

function drawRows(input: {
  readonly document: PDFKit.PDFDocument
  readonly page: InvoiceLayoutPage
}): void {
  const { document, page } = input
  document.font(FONT_REGULAR).fontSize(7).fillColor(TEXT_COLOR)
  page.rows.forEach((row, index) => {
    drawRowCells({
      cells: buildInvoiceRowCells(row),
      document,
      y: TABLE_TOP + index * TABLE_ROW_HEIGHT,
    })
  })
}

function drawRowCells(input: {
  readonly cells: readonly string[]
  readonly document: PDFKit.PDFDocument
  readonly y: number
}): void {
  const { cells, document, y } = input
  let x = PAGE_MARGIN
  INVOICE_TABLE_COLUMNS.forEach((column, index) => {
    document.text(cells[index] ?? '', x, y, {
      align: column.align,
      ellipsis: true,
      height: TABLE_ROW_HEIGHT,
      lineBreak: false,
      width: column.width - CELL_PADDING,
    })
    x += column.width
  })
}

/** O fechamento sai depois da última linha da última página: o total por extenso é impresso uma única vez. */
function drawClosing(input: {
  readonly document: PDFKit.PDFDocument
  readonly layout: InvoiceLayout
}): void {
  const { document, layout } = input
  const lastPage = layout.pages.at(-1)
  const top = resolveClosingTop({
    document,
    layout,
    preferred: TABLE_TOP + (lastPage?.rows.length ?? 0) * TABLE_ROW_HEIGHT + CLOSING_GAP,
  })
  const totalField = layout.invoice.fields.at(-1)

  drawRule({ document, y: top })
  document.font(FONT_BOLD).fontSize(9).fillColor(TEXT_COLOR)
  document.text(`Total da fatura: ${totalField?.value ?? ''}`, PAGE_MARGIN, top + 6, {
    lineBreak: false,
  })
  document.font(FONT_REGULAR).fontSize(8)
  document.text(
    `Valor por extenso: ${layout.totalInWords}`,
    PAGE_MARGIN,
    top + 6 + CLOSING_LINE_HEIGHT,
    { lineBreak: false },
  )

  let cursor = top + 6 + CLOSING_LINE_HEIGHT * 2
  if (layout.payment !== null) {
    drawPayment({ block: layout.payment, document, y: cursor })
    cursor += CLOSING_LINE_HEIGHT
  }
  if (layout.observations === '') return
  drawObservations({ document, text: layout.observations, y: cursor })
}

/** Página cheia com observação longa não espreme o fechamento contra o rodapé: ele ganha página própria. */
function resolveClosingTop(input: {
  readonly document: PDFKit.PDFDocument
  readonly layout: InvoiceLayout
  readonly preferred: number
}): number {
  const { document, layout, preferred } = input
  const required = measureClosingHeight({ document, layout })
  if (preferred + required <= footerTop(document) - CLOSING_GAP) return preferred

  document.addPage()
  return PAGE_MARGIN
}

function measureClosingHeight(input: {
  readonly document: PDFKit.PDFDocument
  readonly layout: InvoiceLayout
}): number {
  const { document, layout } = input
  const paymentHeight = layout.payment === null ? 0 : CLOSING_LINE_HEIGHT
  if (layout.observations === '') return 6 + CLOSING_LINE_HEIGHT * 2 + paymentHeight

  document.font(FONT_REGULAR).fontSize(8)
  const bodyHeight = document.heightOfString(layout.observations, { width: CONTENT_WIDTH })
  return 6 + CLOSING_LINE_HEIGHT * 2 + paymentHeight + OBSERVATIONS_TITLE_HEIGHT + bodyHeight
}

function drawPayment(input: {
  readonly block: InvoiceLayoutBlock
  readonly document: PDFKit.PDFDocument
  readonly y: number
}): void {
  const { block, document, y } = input
  const summary = block.fields.map((field) => `${field.label} ${field.value}`).join(SEPARATOR)

  document.font(FONT_BOLD).fontSize(8)
  document.text(`${block.title}: `, PAGE_MARGIN, y, { continued: true, lineBreak: false })
  document.font(FONT_REGULAR).fontSize(8)
  document.text(summary, { ellipsis: true, lineBreak: false, width: CONTENT_WIDTH })
}

function drawObservations(input: {
  readonly document: PDFKit.PDFDocument
  readonly text: string
  readonly y: number
}): void {
  const { document, text, y } = input
  const bodyTop = y + 11

  document.font(FONT_BOLD).fontSize(8)
  document.text(OBSERVATIONS_TITLE, PAGE_MARGIN, y, { lineBreak: false })
  document.font(FONT_REGULAR).fontSize(8)
  document.text(text, PAGE_MARGIN, bodyTop, {
    ellipsis: true,
    height: footerTop(document) - bodyTop - CLOSING_GAP,
    width: CONTENT_WIDTH,
  })
}

function stampFooters(input: {
  readonly document: PDFKit.PDFDocument
  readonly invoiceNumber: bigint
  readonly printedAt: Date
}): number {
  const { document, invoiceNumber, printedAt } = input
  const range = document.bufferedPageRange()
  const left = [`Fatura ${invoiceNumber}`, `Impresso em ${formatInvoiceDate(printedAt)}`].join(
    SEPARATOR,
  )

  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(range.start + index)
    stampFooter({ document, left, right: `Página ${index + 1} de ${range.count}` })
  }
  document.flushPages()
  return range.count
}

/** Zerar a margem inferior é o único jeito de escrever rodapé sem o pdfkit abrir página nova. */
function stampFooter(input: {
  readonly document: PDFKit.PDFDocument
  readonly left: string
  readonly right: string
}): void {
  const { document, left, right } = input
  const bottomMargin = document.page.margins.bottom
  document.page.margins.bottom = 0
  document.font(FONT_REGULAR).fontSize(7).fillColor(TEXT_COLOR)
  document.text(left, PAGE_MARGIN, footerTop(document), { lineBreak: false })
  document.text(right, PAGE_MARGIN, footerTop(document), {
    align: 'right',
    lineBreak: false,
    width: CONTENT_WIDTH,
  })
  document.page.margins.bottom = bottomMargin
}

function footerTop(document: PDFKit.PDFDocument): number {
  return document.page.height - FOOTER_OFFSET
}

function drawRule(input: { readonly document: PDFKit.PDFDocument; readonly y: number }): void {
  const { document, y } = input
  document
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.5)
    .strokeColor(RULE_COLOR)
    .stroke()
}

function renderToBuffer(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
    document.end()
  })
}
