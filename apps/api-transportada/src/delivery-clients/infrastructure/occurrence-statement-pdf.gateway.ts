/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20 (RF29/RF30). Só desenha — molde de `billing/infrastructure/invoice-pdf.gateway.ts`,
 * duplicado de propósito: aquele imprime cabeçalho de documento fiscal, e este documento não é
 * fiscal. Nenhuma dependência nova: o `pdfkit` já está na app.
 */
import PDFDocument from 'pdfkit'

import {
  buildOccurrenceStatementLayout,
  formatOccurrenceStatementDate,
  type OccurrenceStatementBatch,
  type OccurrenceStatementCarrier,
  type OccurrenceStatementLayout,
  type OccurrenceStatementPage,
  type OccurrenceStatementRow,
  type OccurrenceStatementSourceRow,
} from '../domain/occurrence-statement-layout.policy.js'
import { OCCURRENCE_STATEMENT_MAX_BYTES } from '../domain/occurrence-statement-limits.constant.js'
import { ExtraChargeBatchStatementTooLargeError } from '../domain/occurrence-statement.error.js'

const PAGE_MARGIN = 36
const CONTENT_WIDTH = 523
const FONT_REGULAR = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const RULE_COLOR = '#999999'
const TEXT_COLOR = '#000000'
const SEAL_COLOR = '#555555'
const HEADER_TOP = 36
const BODY_TOP = 176
const ROW_HEIGHT = 116
const ROW_GAP = 8
const PHOTO_BOX = 96
const TEXT_WIDTH = CONTENT_WIDTH - PHOTO_BOX - 12
const LINE_HEIGHT = 12
const FOOTER_OFFSET = 28
const SEPARATOR = ' · '
/** `image/png` e `image/jpeg` são o que o `pdfkit` sabe embutir — o resto vira selo textual. */
const DRAWABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png'])

export type OccurrenceStatementPdfRenderInput = {
  readonly batch: OccurrenceStatementBatch
  readonly carrier: OccurrenceStatementCarrier
  readonly printedAt: Date
  readonly rows: readonly OccurrenceStatementSourceRow[]
}

export type OccurrenceStatementPdfDocument = {
  readonly bytes: Buffer
  readonly pageCount: number
}

export type OccurrenceStatementPdfGateway = {
  readonly render: (
    input: OccurrenceStatementPdfRenderInput,
  ) => Promise<OccurrenceStatementPdfDocument>
}

export type CreateOccurrenceStatementPdfGatewayOptions = {
  /** Só os testes passam outro valor: é o que torna o caso acima do teto barato de exercitar. */
  readonly maxBytes?: number
}

export function createOccurrenceStatementPdfGateway(
  options?: CreateOccurrenceStatementPdfGatewayOptions,
): OccurrenceStatementPdfGateway {
  const maxBytes = options?.maxBytes ?? OCCURRENCE_STATEMENT_MAX_BYTES

  return {
    render: async (input) => {
      const layout = buildOccurrenceStatementLayout({
        batch: input.batch,
        carrier: input.carrier,
        maxBytes,
        rows: input.rows,
      })

      const document = new PDFDocument({
        bufferPages: true,
        compress: true,
        margin: PAGE_MARGIN,
        size: 'A4',
      })
      document.info.CreationDate = input.printedAt
      document.info.Title = `Demonstrativo de ressarcimento ${input.batch.id}`

      for (const page of layout.pages) {
        if (page.pageNumber > 1) document.addPage()
        drawPageHeader({ document, layout })
        drawRows({ document, page })
      }

      const pageCount = stampFooters({
        batchId: input.batch.id,
        document,
        printedAt: input.printedAt,
      })

      const bytes = await renderToBuffer(document)
      /**
       * ⚠️ A medida que decide é o arquivo montado. A recusa da política é antecipação barata pelo
       * somatório das imagens; esta é a que fecha o teto, inclusive quando o texto é que cresceu.
       */
      if (bytes.byteLength > maxBytes) {
        throw new ExtraChargeBatchStatementTooLargeError({
          limitBytes: maxBytes,
          measuredBytes: bytes.byteLength,
        })
      }

      return { bytes, pageCount }
    },
  }
}

function drawPageHeader(input: {
  readonly document: PDFKit.PDFDocument
  readonly layout: OccurrenceStatementLayout
}): void {
  const { document, layout } = input

  document.fillColor(TEXT_COLOR)
  document.font(FONT_BOLD).fontSize(13)
  document.text(layout.carrier.legalName, PAGE_MARGIN, HEADER_TOP, {
    ellipsis: true,
    lineBreak: false,
    width: CONTENT_WIDTH,
  })
  document.font(FONT_REGULAR).fontSize(8)
  document.text(layout.carrier.taxLine, PAGE_MARGIN, HEADER_TOP + 18, {
    ellipsis: true,
    lineBreak: false,
    width: CONTENT_WIDTH,
  })

  document.font(FONT_BOLD).fontSize(11)
  document.text(layout.title, PAGE_MARGIN, HEADER_TOP + 34, {
    ellipsis: true,
    lineBreak: false,
    width: CONTENT_WIDTH,
  })

  document.font(FONT_REGULAR).fontSize(8)
  layout.batch.forEach((field, index) => {
    document.text(
      `${field.label}: ${field.value}`,
      PAGE_MARGIN + (index % 2) * (CONTENT_WIDTH / 2),
      HEADER_TOP + 52 + Math.floor(index / 2) * LINE_HEIGHT,
      { ellipsis: true, lineBreak: false, width: CONTENT_WIDTH / 2 - 8 },
    )
  })

  document.font(FONT_BOLD).fontSize(9)
  document.text(`Total do demonstrativo: ${layout.totalText}`, PAGE_MARGIN, HEADER_TOP + 82, {
    lineBreak: false,
  })

  /** RF30: a frase fica no topo de toda página — quem imprime uma folha solta também a lê. */
  document.font(FONT_BOLD).fontSize(7).fillColor(TEXT_COLOR)
  document.text(layout.disclaimer, PAGE_MARGIN, HEADER_TOP + 98, { width: CONTENT_WIDTH })

  drawRule({ document, y: BODY_TOP - 10 })
}

function drawRows(input: {
  readonly document: PDFKit.PDFDocument
  readonly page: OccurrenceStatementPage
}): void {
  const { document, page } = input
  page.rows.forEach((row, index) => {
    drawRow({ document, row, y: BODY_TOP + index * (ROW_HEIGHT + ROW_GAP) })
  })
}

function drawRow(input: {
  readonly document: PDFKit.PDFDocument
  readonly row: OccurrenceStatementRow
  readonly y: number
}): void {
  const { document, row, y } = input

  document.fillColor(TEXT_COLOR).font(FONT_BOLD).fontSize(9)
  document.text(row.headline, PAGE_MARGIN, y, {
    ellipsis: true,
    lineBreak: false,
    width: TEXT_WIDTH,
  })
  document.font(FONT_BOLD).fontSize(10)
  document.text(row.amountText, PAGE_MARGIN, y + LINE_HEIGHT, { lineBreak: false })

  document.font(FONT_REGULAR).fontSize(8)
  const details = [row.productsText, row.noteText, row.extraPhotosText].filter(
    (part) => part !== '',
  )
  document.text(details.join('\n'), PAGE_MARGIN, y + LINE_HEIGHT * 2 + 4, {
    ellipsis: true,
    height: ROW_HEIGHT - LINE_HEIGHT * 2 - 4,
    width: TEXT_WIDTH,
  })

  drawEvidence({ document, row, y })
  drawRule({ document, y: y + ROW_HEIGHT + 2 })
}

/** Anexo vencido nunca vira imagem quebrada: no lugar da foto entra o selo, legível e explícito. */
function drawEvidence(input: {
  readonly document: PDFKit.PDFDocument
  readonly row: OccurrenceStatementRow
  readonly y: number
}): void {
  const { document, row, y } = input
  const left = PAGE_MARGIN + CONTENT_WIDTH - PHOTO_BOX
  const { evidence } = row

  if (evidence.kind === 'image' && DRAWABLE_MIME_TYPES.has(evidence.mimeType)) {
    try {
      document.image(Buffer.from(evidence.bytes), left, y, { fit: [PHOTO_BOX, PHOTO_BOX] })
      return
    } catch {
      /** Foto corrompida não derruba o demonstrativo: cai no selo, como o anexo vencido. */
    }
  }

  document
    .rect(left, y, PHOTO_BOX, PHOTO_BOX)
    .lineWidth(0.5)
    .strokeColor(RULE_COLOR)
    .dash(2, { space: 2 })
    .stroke()
  document.undash()
  document.font(FONT_REGULAR).fontSize(6).fillColor(SEAL_COLOR)
  document.text(
    row.evidenceSeal === '' ? 'Evidência indisponível.' : row.evidenceSeal,
    left + 4,
    y + 8,
    {
      align: 'center',
      width: PHOTO_BOX - 8,
    },
  )
  document.fillColor(TEXT_COLOR)
}

function stampFooters(input: {
  readonly batchId: string
  readonly document: PDFKit.PDFDocument
  readonly printedAt: Date
}): number {
  const { batchId, document, printedAt } = input
  const range = document.bufferedPageRange()
  const left = [
    `Lote ${batchId}`,
    `Gerado em ${formatOccurrenceStatementDate(printedAt)}`,
    'Não é documento fiscal',
  ].join(SEPARATOR)

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
