/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF10-RF12. Só desenha — molde de `occurrence-statement-pdf.gateway.ts`. A posição dos
 * blocos vem de `placeProofBlock`; a orientação EXIF o próprio `pdfkit` aplica ao desenhar JPEG.
 */
import PDFDocument from 'pdfkit'

import type { TripProofPdfRenderer } from '../application/trip-proof-report.port.js'
import {
  buildTripProofInfoLines,
  formatTripProofDateTime,
} from '../domain/trip-proof-block-info.policy.js'
import {
  PROOF_BLOCK_GAP_CM,
  PROOF_IMAGE_MIN_HEIGHT_CM,
  PROOF_INFO_HEIGHT_CM,
  PROOF_INITIAL_CURSOR,
  PROOF_PAGE_MARGIN_CM,
  PROOF_USABLE_WIDTH_CM,
  placeProofBlock,
  type ProofBlockPlacement,
  type ProofImageSize,
  resolveProofBlockHeightCm,
  resolveProofImageHeightCm,
  shouldRotateProofImage,
} from '../domain/trip-proof-page.layout.js'
import {
  TRIP_PROOF_REPORT_DRAWABLE_MIME_TYPES,
  TRIP_PROOF_REPORT_FIELD_SEPARATOR,
  TRIP_PROOF_REPORT_TEXT,
} from '../domain/trip-proof-report.constant.js'
import type { TripProofBlock, TripProofLetterhead } from '../domain/trip-proof-report.types.js'

const POINTS_PER_CM = 72 / 2.54
const FONT_REGULAR = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const RULE_COLOR = '#999999'
const TEXT_COLOR = '#000000'
const MARGIN_POINTS = PROOF_PAGE_MARGIN_CM * POINTS_PER_CM
const CONTENT_WIDTH_POINTS = PROOF_USABLE_WIDTH_CM * POINTS_PER_CM
const BODY_TOP_POINTS = (PROOF_PAGE_MARGIN_CM + 1.2) * POINTS_PER_CM
const LOGO_HEIGHT_POINTS = 1 * POINTS_PER_CM
const FOOTER_OFFSET_POINTS = 1.1 * POINTS_PER_CM
const LINE_HEIGHT_POINTS = 11
const DEFAULT_EXIF_ORIENTATION = 1
const FIRST_TRANSPOSED_EXIF_ORIENTATION = 5

type Document = PDFKit.PDFDocument
/** `openImage` existe no pdfkit, mas falta nos tipos instalados. */
type OpenedImage = {
  readonly height: number
  readonly orientation?: number
  readonly width: number
}
type ImageOpeningDocument = Document & { openImage(source: Buffer): OpenedImage }
type ImageSource = Parameters<Document['image']>[0]

export function createTripProofPdfGateway(): TripProofPdfRenderer {
  return {
    render: async (input) => {
      const document = new PDFDocument({
        autoFirstPage: false,
        bufferPages: true,
        margin: 0,
        size: 'A4',
      })
      const bytesPromise = collectBytes(document)
      startPage({ document, letterhead: input.letterhead })

      let cursor = PROOF_INITIAL_CURSOR
      for (const block of input.blocks) {
        const drawn = await prepareBlock({ block, document })
        const placed = placeProofBlock({ blockHeightCm: drawn.blockHeightCm, cursor })
        cursor = placed.cursor
        if (placed.placement.pageNumber > document.bufferedPageRange().count) {
          startPage({ document, letterhead: input.letterhead })
        }
        drawBlock({ block, document, drawn, placement: placed.placement })
      }

      stampFooters({ document, exportedBy: input.exportedBy, generatedAt: input.generatedAt })
      document.end()
      return toStream(await bytesPromise)
    },
  }
}

type PreparedBlock = {
  readonly blockHeightCm: number
  readonly image: OpenedImage | undefined
  readonly placeholder: string | undefined
}

/** A imagem é lida uma de cada vez e só aqui: um lote de canhotos não cabe todo na memória. */
async function prepareBlock(input: {
  readonly block: TripProofBlock
  readonly document: Document
}): Promise<PreparedBlock> {
  const { block, document } = input
  const placeholderHeightCm = resolveProofBlockHeightCm(PROOF_IMAGE_MIN_HEIGHT_CM)
  if (block.image === undefined) {
    return {
      blockHeightCm: placeholderHeightCm,
      image: undefined,
      placeholder: TRIP_PROOF_REPORT_TEXT.noProof,
    }
  }
  const unavailable = {
    blockHeightCm: placeholderHeightCm,
    image: undefined,
    placeholder: TRIP_PROOF_REPORT_TEXT.imageUnavailable,
  }
  if (!TRIP_PROOF_REPORT_DRAWABLE_MIME_TYPES.has(block.image.mimeType)) return unavailable

  try {
    const bytes = await block.image.read()
    const image = (document as ImageOpeningDocument).openImage(Buffer.from(bytes))
    const imageHeightCm = resolveProofImageHeightCm(readOrientedSize(image))
    return {
      blockHeightCm: resolveProofBlockHeightCm(imageHeightCm),
      image,
      placeholder: undefined,
    }
  } catch {
    return unavailable
  }
}

/** O objeto de `openImage` é o que `image()` aceita, só não está nos tipos. */
function toImageSource(image: OpenedImage): ImageSource {
  return image as unknown as ImageSource
}

function readOrientedSize(image: OpenedImage): ProofImageSize {
  const { orientation = DEFAULT_EXIF_ORIENTATION } = image
  const isTransposed = orientation >= FIRST_TRANSPOSED_EXIF_ORIENTATION
  return isTransposed
    ? { heightPx: image.width, widthPx: image.height }
    : { heightPx: image.height, widthPx: image.width }
}

function startPage(input: {
  readonly document: Document
  readonly letterhead: TripProofLetterhead
}): void {
  const { document, letterhead } = input
  document.addPage()
  let textLeft = MARGIN_POINTS
  if (letterhead.logoBytes !== undefined) {
    try {
      document.image(Buffer.from(letterhead.logoBytes), MARGIN_POINTS, MARGIN_POINTS, {
        fit: [LOGO_HEIGHT_POINTS * 2, LOGO_HEIGHT_POINTS],
      })
      textLeft += LOGO_HEIGHT_POINTS * 2 + 8
    } catch {
      // Logo corrompido não derruba o relatório: segue só com o nome.
    }
  }
  document.font(FONT_BOLD).fontSize(10).fillColor(TEXT_COLOR)
  document.text(letterhead.legalName, textLeft, MARGIN_POINTS + 2, { lineBreak: false })
  document.font(FONT_REGULAR).fontSize(8)
  document.text(letterhead.taxLine, textLeft, MARGIN_POINTS + 2 + LINE_HEIGHT_POINTS + 2, {
    lineBreak: false,
  })
}

function drawBlock(input: {
  readonly block: TripProofBlock
  readonly document: Document
  readonly drawn: PreparedBlock
  readonly placement: ProofBlockPlacement
}): void {
  const { block, document, drawn, placement } = input
  const top = BODY_TOP_POINTS + placement.topCm * POINTS_PER_CM

  document.font(FONT_REGULAR).fontSize(8).fillColor(TEXT_COLOR)
  buildTripProofInfoLines(block).forEach((line, index) => {
    document.font(index === 0 ? FONT_BOLD : FONT_REGULAR)
    document.text(line, MARGIN_POINTS, top + index * LINE_HEIGHT_POINTS, {
      ellipsis: true,
      height: LINE_HEIGHT_POINTS,
      lineBreak: false,
      width: CONTENT_WIDTH_POINTS,
    })
  })

  const imageTop = BODY_TOP_POINTS + placement.imageTopCm * POINTS_PER_CM
  const imageHeight =
    (placement.blockHeightCm - PROOF_INFO_HEIGHT_CM - PROOF_BLOCK_GAP_CM) * POINTS_PER_CM
  if (drawn.image === undefined) {
    drawPlaceholder({ document, height: imageHeight, text: drawn.placeholder ?? '', top: imageTop })
    return
  }
  drawImage({ document, height: imageHeight, image: drawn.image, top: imageTop })
}

function drawImage(input: {
  readonly document: Document
  readonly height: number
  readonly image: OpenedImage
  readonly top: number
}): void {
  const { document, height, image, top } = input
  const centerX = MARGIN_POINTS + CONTENT_WIDTH_POINTS / 2
  const centerY = top + height / 2
  if (!shouldRotateProofImage(readOrientedSize(image))) {
    document.image(toImageSource(image), MARGIN_POINTS, top, {
      align: 'center',
      fit: [CONTENT_WIDTH_POINTS, height],
      valign: 'center',
    })
    return
  }
  document.save()
  document.rotate(90, { origin: [centerX, centerY] })
  document.image(toImageSource(image), centerX - height / 2, centerY - CONTENT_WIDTH_POINTS / 2, {
    align: 'center',
    fit: [height, CONTENT_WIDTH_POINTS],
    valign: 'center',
  })
  document.restore()
}

function drawPlaceholder(input: {
  readonly document: Document
  readonly height: number
  readonly text: string
  readonly top: number
}): void {
  const { document, height, text, top } = input
  document
    .rect(MARGIN_POINTS, top, CONTENT_WIDTH_POINTS, height)
    .lineWidth(0.5)
    .strokeColor(RULE_COLOR)
    .dash(2, { space: 2 })
    .stroke()
  document.undash()
  document.font(FONT_REGULAR).fontSize(9).fillColor(RULE_COLOR)
  document.text(text, MARGIN_POINTS, top + height / 2 - 5, {
    align: 'center',
    lineBreak: false,
    width: CONTENT_WIDTH_POINTS,
  })
  document.fillColor(TEXT_COLOR)
}

function stampFooters(input: {
  readonly document: Document
  readonly exportedBy: string
  readonly generatedAt: Date
}): void {
  const { document, exportedBy, generatedAt } = input
  const range = document.bufferedPageRange()
  const left = [
    `${TRIP_PROOF_REPORT_TEXT.exportedBy} ${exportedBy}`,
    `${TRIP_PROOF_REPORT_TEXT.generatedAt} ${formatTripProofDateTime(generatedAt.toISOString())}`,
  ].join(TRIP_PROOF_REPORT_FIELD_SEPARATOR)
  const top = document.page.height - FOOTER_OFFSET_POINTS

  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(range.start + index)
    document.font(FONT_REGULAR).fontSize(7).fillColor(TEXT_COLOR)
    document.text(left, MARGIN_POINTS, top, { lineBreak: false })
    document.text(
      `${TRIP_PROOF_REPORT_TEXT.pageLabel} ${index + 1} ${TRIP_PROOF_REPORT_TEXT.pageOf} ${range.count}`,
      MARGIN_POINTS,
      top,
      { align: 'right', lineBreak: false, width: CONTENT_WIDTH_POINTS },
    )
  }
  document.flushPages()
}

function collectBytes(document: Document): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
  })
}

function toStream(bytes: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })
}
