/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import PDFDocument from 'pdfkit'

import { buildDacteLayout } from '../domain/dacte-layout.policy.js'
import {
  DACTE_LAYOUT_COLUMNS,
  type DacteLayout,
  type DacteLayoutSection,
} from '../domain/dacte-layout.types.js'

import { createDacteBarcodeGateway, type DacteBarcodeGateway } from './dacte-barcode.gateway.js'
import { parseCteXmlForDacte } from './cte-xml.mapper.js'

const PAGE_MARGIN = 24
const CONTENT_WIDTH = 547
const PAGE_BOTTOM = 812
const COLUMN_WIDTH = CONTENT_WIDTH / DACTE_LAYOUT_COLUMNS
const FONT_REGULAR = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const RULE_COLOR = '#666666'
const BAND_COLOR = '#e5e5e5'
const LEGEND_COLOR = '#b00020'
const LABEL_SIZE = 5.5
const VALUE_SIZE = 8
const TITLE_HEIGHT = 12
const FIELD_HEIGHT = 24
const LOGO_BOX = 40
const BARCODE_WIDTH = 246
const BARCODE_HEIGHT = 34
const QR_BOX = 62
const IDENTITY_WIDTH = 220
const HEADER_HEIGHT = 80

export type DactePdfLogo = { readonly bytes: Buffer }

export type DactePdfRenderInput = { readonly xml: string }

export type DactePdfDocument = { readonly bytes: Buffer; readonly pageCount: number }

export type DactePdfGateway = {
  readonly render: (input: DactePdfRenderInput) => Promise<DactePdfDocument>
}

export type CreateDactePdfGatewayOptions = {
  readonly barcodes?: DacteBarcodeGateway
  readonly compress?: boolean
  readonly logo?: DactePdfLogo | null
}

type Cursor = { y: number }

export function createDactePdfGateway(options?: CreateDactePdfGatewayOptions): DactePdfGateway {
  const barcodes = options?.barcodes ?? createDacteBarcodeGateway()
  return {
    render: async (input) => {
      const layout = buildDacteLayout(parseCteXmlForDacte(input.xml))
      const accessKeyImage = await barcodes.renderAccessKey(layout.barcodeValue)
      const qrCodeImage =
        layout.qrCodeValue === undefined ? null : await barcodes.renderQrCode(layout.qrCodeValue)

      const document = new PDFDocument({
        bufferPages: true,
        compress: options?.compress ?? true,
        margin: PAGE_MARGIN,
        size: 'A4',
      })
      document.info.Title = `DACTE ${layout.number}`

      const cursor: Cursor = { y: PAGE_MARGIN }
      drawHeader({
        accessKeyImage,
        cursor,
        document,
        layout,
        logo: options?.logo ?? null,
        qrCodeImage,
      })
      for (const section of layout.sections) drawSection({ cursor, document, section })

      const pageCount = document.bufferedPageRange().count

      return { bytes: await renderToBuffer(document), pageCount }
    },
  }
}

function drawHeader(input: {
  readonly accessKeyImage: Buffer
  readonly cursor: Cursor
  readonly document: PDFKit.PDFDocument
  readonly layout: DacteLayout
  readonly logo: DactePdfLogo | null
  readonly qrCodeImage: Buffer | null
}): void {
  const { accessKeyImage, cursor, document, layout, qrCodeImage } = input
  const identityLeft = PAGE_MARGIN + (input.logo === null ? 0 : LOGO_BOX + 8)
  const identityWidth = IDENTITY_WIDTH - (identityLeft - PAGE_MARGIN)

  drawLogo({ document, logo: input.logo, top: cursor.y })
  document.fillColor('#000000').font(FONT_BOLD).fontSize(9)
  document.text(layout.emitter.lines[0] ?? '', identityLeft, cursor.y, singleLine(identityWidth))
  document.font(FONT_REGULAR).fontSize(7)
  layout.emitter.lines.slice(1).forEach((line, index) => {
    document.text(line, identityLeft, cursor.y + 12 + index * 9, singleLine(identityWidth))
  })

  const rightLeft = PAGE_MARGIN + CONTENT_WIDTH - (BARCODE_WIDTH + QR_BOX + 8)
  document.font(FONT_BOLD).fontSize(14)
  document.text('DACTE', rightLeft, cursor.y, singleLine(BARCODE_WIDTH))
  document.font(FONT_REGULAR).fontSize(6)
  document.text(
    'Documento Auxiliar do Conhecimento de Transporte Eletrônico',
    rightLeft,
    cursor.y + 16,
    singleLine(BARCODE_WIDTH),
  )
  document.fontSize(7)
  document.text(
    `MODAL ${layout.modal}   SÉRIE ${layout.series}   NÚMERO ${layout.number}   EMISSÃO ${layout.issuedAt}`,
    rightLeft,
    cursor.y + 26,
    singleLine(BARCODE_WIDTH),
  )
  drawImage({
    document,
    image: accessKeyImage,
    options: { fit: [BARCODE_WIDTH, BARCODE_HEIGHT] },
    x: rightLeft,
    y: cursor.y + 38,
  })
  if (qrCodeImage !== null) {
    drawImage({
      document,
      image: qrCodeImage,
      options: { fit: [QR_BOX, QR_BOX] },
      x: PAGE_MARGIN + CONTENT_WIDTH - QR_BOX,
      y: cursor.y + 12,
    })
  }

  cursor.y += HEADER_HEIGHT
  drawFieldRow({
    cursor,
    document,
    fields: [
      { label: 'CHAVE DE ACESSO', value: layout.accessKeyGrouped, width: 8 },
      { label: 'PROTOCOLO DE AUTORIZAÇÃO DE USO', value: layout.protocol ?? '', width: 4 },
    ],
  })
  if (layout.legend !== undefined) {
    document.fillColor(LEGEND_COLOR).font(FONT_BOLD).fontSize(10)
    document.text(layout.legend, PAGE_MARGIN, cursor.y + 2, {
      align: 'center',
      width: CONTENT_WIDTH,
    })
    document.fillColor('#000000')
    cursor.y += 16
  }
}

function drawSection(input: {
  readonly cursor: Cursor
  readonly document: PDFKit.PDFDocument
  readonly section: DacteLayoutSection
}): void {
  const { cursor, document, section } = input
  ensureSpace({ cursor, document, height: TITLE_HEIGHT + FIELD_HEIGHT })

  document
    .rect(PAGE_MARGIN, cursor.y, CONTENT_WIDTH, TITLE_HEIGHT)
    .fillAndStroke(BAND_COLOR, RULE_COLOR)
  document.fillColor('#000000').font(FONT_BOLD).fontSize(6.5)
  document.text(section.title, PAGE_MARGIN + 3, cursor.y + 3, singleLine(CONTENT_WIDTH - 6))
  cursor.y += TITLE_HEIGHT

  for (const row of section.rows) drawFieldRow({ cursor, document, fields: row.fields })
  cursor.y += 4
}

function drawFieldRow(input: {
  readonly cursor: Cursor
  readonly document: PDFKit.PDFDocument
  readonly fields: readonly {
    readonly label: string
    readonly value: string
    readonly width: number
  }[]
}): void {
  const { cursor, document, fields } = input
  ensureSpace({ cursor, document, height: FIELD_HEIGHT })

  const declaredColumns = fields.reduce((total, field) => total + field.width, 0)
  const lastIndex = fields.length - 1
  let left = PAGE_MARGIN
  for (const [index, field] of fields.entries()) {
    // A linha fecha na margem: a última caixa absorve as colunas que a linha não usou.
    const columns =
      index === lastIndex ? field.width + DACTE_LAYOUT_COLUMNS - declaredColumns : field.width
    const width = columns * COLUMN_WIDTH
    document.rect(left, cursor.y, width, FIELD_HEIGHT).stroke(RULE_COLOR)
    document.fillColor('#444444').font(FONT_REGULAR).fontSize(LABEL_SIZE)
    document.text(field.label, left + 3, cursor.y + 3, singleLine(width - 6))
    document.fillColor('#000000').font(FONT_BOLD).fontSize(VALUE_SIZE)
    document.text(field.value, left + 3, cursor.y + 12, singleLine(width - 6))
    left += width
  }
  cursor.y += FIELD_HEIGHT
}

/** Decoração nunca derruba documento fiscal: logo ilegível sai do papel, o DACTE continua. */
function drawLogo(input: {
  readonly document: PDFKit.PDFDocument
  readonly logo: DactePdfLogo | null
  readonly top: number
}): void {
  if (input.logo === null) return
  drawImage({
    document: input.document,
    image: input.logo.bytes,
    options: { fit: [LOGO_BOX, LOGO_BOX] },
    x: PAGE_MARGIN,
    y: input.top,
  })
}

function drawImage(input: {
  readonly document: PDFKit.PDFDocument
  readonly image: Buffer
  readonly options: PDFKit.Mixins.ImageOption
  readonly x: number
  readonly y: number
}): void {
  try {
    input.document.image(input.image, input.x, input.y, input.options)
  } catch {
    return
  }
}

function ensureSpace(input: {
  readonly cursor: Cursor
  readonly document: PDFKit.PDFDocument
  readonly height: number
}): void {
  if (input.cursor.y + input.height <= PAGE_BOTTOM) return
  input.document.addPage()
  input.cursor.y = PAGE_MARGIN
}

/** `height` é o que faz o pdfkit truncar: sem ele o valor longo invade a linha de baixo. */
function singleLine(width: number, height = 11): PDFKit.Mixins.TextOptions {
  return { ellipsis: true, height, lineBreak: true, width }
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
