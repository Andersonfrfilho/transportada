/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import PDFDocument from 'pdfkit'

import {
  FISCAL_SHEET_COLUMNS,
  type FiscalSheet,
  type FiscalSheetSection,
} from './fiscal-sheet.types.js'

const PAGE_MARGIN = 24
const CONTENT_WIDTH = 547
const PAGE_BOTTOM = 812
const COLUMN_WIDTH = CONTENT_WIDTH / FISCAL_SHEET_COLUMNS
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

/** Empresa sem marca cadastrada é o caso normal: o cabeçalho simplesmente não a desenha. */
export type FiscalSheetLogo = { readonly bytes: Buffer }

export type FiscalSheetImages = {
  readonly accessKey: Buffer
  readonly qrCode: Buffer | null
}

export type FiscalSheetDocument = { readonly bytes: Buffer; readonly pageCount: number }

export type DrawFiscalSheetParams = {
  readonly compress?: boolean
  readonly images: FiscalSheetImages
  readonly logo?: FiscalSheetLogo | null
  readonly sheet: FiscalSheet
  /** Vai para o `Title` do PDF — é o que o leitor de tela e a aba do navegador anunciam. */
  readonly documentTitle: string
}

type Cursor = { y: number }

/**
 * O desenho é comum a DACTE e DAMDFE; o conteúdo, não. Quem chama traz a folha já montada — este
 * módulo não sabe o que é CT-e nem MDF-e, e é isso que impede a regra fiscal de vazar para o papel.
 */
export async function drawFiscalSheet(input: DrawFiscalSheetParams): Promise<FiscalSheetDocument> {
  const { sheet } = input
  const document = new PDFDocument({
    bufferPages: true,
    compress: input.compress ?? true,
    margin: PAGE_MARGIN,
    size: 'A4',
  })
  document.info.Title = input.documentTitle

  const cursor: Cursor = { y: PAGE_MARGIN }
  drawHeader({
    accessKeyImage: input.images.accessKey,
    cursor,
    document,
    logo: input.logo ?? null,
    qrCodeImage: input.images.qrCode,
    sheet,
  })
  for (const section of sheet.sections) drawSection({ cursor, document, section })

  const pageCount = document.bufferedPageRange().count

  return { bytes: await renderToBuffer(document), pageCount }
}

function drawHeader(input: {
  readonly accessKeyImage: Buffer
  readonly cursor: Cursor
  readonly document: PDFKit.PDFDocument
  readonly sheet: FiscalSheet
  readonly logo: FiscalSheetLogo | null
  readonly qrCodeImage: Buffer | null
}): void {
  const { accessKeyImage, cursor, document, qrCodeImage, sheet } = input
  const identityLeft = PAGE_MARGIN + (input.logo === null ? 0 : LOGO_BOX + 8)
  const identityWidth = IDENTITY_WIDTH - (identityLeft - PAGE_MARGIN)

  drawLogo({ document, logo: input.logo, top: cursor.y })
  document.fillColor('#000000').font(FONT_BOLD).fontSize(9)
  document.text(sheet.emitter.lines[0] ?? '', identityLeft, cursor.y, singleLine(identityWidth))
  document.font(FONT_REGULAR).fontSize(7)
  sheet.emitter.lines.slice(1).forEach((line, index) => {
    document.text(line, identityLeft, cursor.y + 12 + index * 9, singleLine(identityWidth))
  })

  const rightLeft = PAGE_MARGIN + CONTENT_WIDTH - (BARCODE_WIDTH + QR_BOX + 8)
  document.font(FONT_BOLD).fontSize(14)
  document.text(sheet.title, rightLeft, cursor.y, singleLine(BARCODE_WIDTH))
  document.font(FONT_REGULAR).fontSize(6)
  document.text(sheet.subtitle, rightLeft, cursor.y + 16, singleLine(BARCODE_WIDTH))
  document.fontSize(7)
  document.text(sheet.metaLine, rightLeft, cursor.y + 26, singleLine(BARCODE_WIDTH))
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
      { label: 'CHAVE DE ACESSO', value: sheet.accessKeyGrouped, width: 8 },
      { label: 'PROTOCOLO DE AUTORIZAÇÃO DE USO', value: sheet.protocol ?? '', width: 4 },
    ],
  })
  if (sheet.legend !== undefined) {
    document.fillColor(LEGEND_COLOR).font(FONT_BOLD).fontSize(10)
    document.text(sheet.legend, PAGE_MARGIN, cursor.y + 2, {
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
  readonly section: FiscalSheetSection
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
      index === lastIndex ? field.width + FISCAL_SHEET_COLUMNS - declaredColumns : field.width
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

/** Decoração nunca derruba documento fiscal: logo ilegível sai do papel, o documento continua. */
function drawLogo(input: {
  readonly document: PDFKit.PDFDocument
  readonly logo: FiscalSheetLogo | null
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
