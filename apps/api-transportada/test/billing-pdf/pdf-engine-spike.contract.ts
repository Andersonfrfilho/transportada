/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import PDFDocument from 'pdfkit'

const PDF_HEADER = '%PDF-'
const PDF_TRAILER = '%%EOF'
const PAGE_MARGIN = 72
const TABLE_TOP = 150
const TABLE_ROW_HEIGHT = 16
const TABLE_BOTTOM_LIMIT = 700
const FOOTER_OFFSET = 50

type SpikeRow = {
  readonly cteNumber: string
  readonly grossWeight: string
  readonly recipientName: string
  readonly totalAmount: string
}

function buildRows(count: number): readonly SpikeRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    cteNumber: String(1000 + index),
    grossWeight: `${(index + 1) * 10}.000`,
    recipientName: `Destinatario Sintetico ${index + 1}`,
    totalAmount: `${(index + 1) * 3}.75`,
  }))
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

function drawRow(input: {
  readonly document: PDFKit.PDFDocument
  readonly row: SpikeRow
  readonly y: number
}): void {
  const { document, row, y } = input
  document.fontSize(9)
  document.text(row.cteNumber, PAGE_MARGIN, y, { lineBreak: false })
  document.text(row.recipientName, PAGE_MARGIN + 70, y, { lineBreak: false })
  document.text(row.grossWeight, PAGE_MARGIN + 260, y, { lineBreak: false })
  document.text(row.totalAmount, PAGE_MARGIN + 360, y, { lineBreak: false })
}

/** Tabela posicionada não quebra sozinha: a quebra é decidida pelo cursor, como o layout real fará. */
function drawTable(input: {
  readonly document: PDFKit.PDFDocument
  readonly rows: readonly SpikeRow[]
}): void {
  const { document, rows } = input
  let y = TABLE_TOP
  for (const row of rows) {
    if (y > TABLE_BOTTOM_LIMIT) {
      document.addPage()
      y = TABLE_TOP
    }
    drawRow({ document, row, y })
    y += TABLE_ROW_HEIGHT
  }
}

/** Zerar a margem inferior é o único jeito de escrever rodapé sem o pdfkit abrir página nova. */
function stampFooter(input: {
  readonly document: PDFKit.PDFDocument
  readonly text: string
}): void {
  const { document, text } = input
  const bottomMargin = document.page.margins.bottom
  document.page.margins.bottom = 0
  document.fontSize(8)
  document.text(text, PAGE_MARGIN, document.page.height - FOOTER_OFFSET, { lineBreak: false })
  document.page.margins.bottom = bottomMargin
}

function stampPageNumbers(document: PDFKit.PDFDocument): number {
  const range = document.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(range.start + index)
    stampFooter({ document, text: `Pagina ${index + 1} de ${range.count}` })
  }
  document.flushPages()
  return range.count
}

function countPageObjects(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

describe('invoice pdf engine spike', () => {
  test('gera um PDF de uma pagina com texto e tabela, com cabecalho e trailer validos', async () => {
    const document = new PDFDocument({ bufferPages: true, margin: PAGE_MARGIN })
    document.fontSize(18).text('Fatura sintetica de spike', { align: 'center' })
    document.fontSize(10).text('Transportadora Sintetica LTDA - documento de teste')
    drawTable({ document, rows: buildRows(8) })
    const pageCount = stampPageNumbers(document)
    const bytes = await renderToBuffer(document)

    expect(pageCount).toBe(1)
    expect(bytes.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER)
    expect(bytes.subarray(-16).toString('latin1')).toContain(PDF_TRAILER)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(countPageObjects(bytes)).toBe(1)
  })

  test('carrega as metricas AFM do proprio pacote sob Bun', () => {
    const document = new PDFDocument({ margin: PAGE_MARGIN })
    document.fontSize(12)
    const shortWidth = document.widthOfString('Fatura')
    const longWidth = document.widthOfString('Fatura de prestacao de servico de transporte')

    expect(Number.isFinite(shortWidth)).toBe(true)
    expect(shortWidth).toBeGreaterThan(0)
    expect(longWidth).toBeGreaterThan(shortWidth)
    expect(document.heightOfString('Fatura')).toBeGreaterThan(0)
  })

  test('quebra em mais de uma pagina e o rodape numerado nao cria pagina extra', async () => {
    const document = new PDFDocument({ bufferPages: true, margin: PAGE_MARGIN })
    drawTable({ document, rows: buildRows(120) })
    const pageCount = stampPageNumbers(document)
    const bytes = await renderToBuffer(document)

    expect(pageCount).toBeGreaterThan(1)
    expect(countPageObjects(bytes)).toBe(pageCount)
    expect(bytes.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER)
    expect(bytes.subarray(-16).toString('latin1')).toContain(PDF_TRAILER)
  })

  test('escreve o texto no content stream com a fonte padrao embutida', async () => {
    const document = new PDFDocument({ compress: false, margin: PAGE_MARGIN })
    document.fontSize(12).text('Total geral da fatura')
    const bytes = await renderToBuffer(document)

    expect(bytes.toString('latin1')).toContain('Helvetica')
    expect(bytes.byteLength).toBeGreaterThan(500)
  })
})
