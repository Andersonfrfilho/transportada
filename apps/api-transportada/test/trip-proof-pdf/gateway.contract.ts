/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it, spyOn } from 'bun:test'

import PDFDocument from 'pdfkit'
import { extractText, getDocumentProxy } from 'unpdf'

import { createTripProofPdfGateway } from '../../src/trips/infrastructure/trip-proof-pdf.gateway.js'
import type {
  TripProofBlock,
  TripProofImage,
  TripProofLetterhead,
} from '../../src/trips/domain/trip-proof-report.types.js'
import type { TripReportRow } from '../../src/trips/domain/trip-report.types.js'
import { buildSolidPngBytes } from '../fixtures/proof-image.fixture.js'

const LETTERHEAD: TripProofLetterhead = {
  legalName: 'Transportadora Ada',
  logoBytes: undefined,
  taxLine: 'CNPJ 12.345.678/0001-90',
}

const SILENT_LOGGER = { warn() {} }

function buildRow(documentNumber: string): TripReportRow {
  return {
    accessKey: `3526${documentNumber.padStart(40, '0')}`,
    contractorName: 'Contratante Alfa',
    documentNumber,
    documentSeries: '1',
    documentStatus: 'delivered',
    recipientCity: 'Campinas',
    recipientName: 'Loja Beta',
    recipientState: 'SP',
    tone: 'finished',
    tripId: '11111111-1111-4111-8111-111111111111',
  } as TripReportRow
}

function buildImage(input: {
  readonly heightPx: number
  readonly mimeType?: string
  readonly widthPx: number
}): TripProofImage {
  return {
    mimeType: input.mimeType ?? 'image/png',
    read: async () => buildSolidPngBytes(input),
  }
}

function buildBlock(documentNumber: string, image: TripProofImage | undefined): TripProofBlock {
  return { image, proofIndex: 1, proofTotal: 1, row: buildRow(documentNumber) }
}

async function renderPdf(input: {
  readonly blocks: readonly TripProofBlock[]
  readonly letterhead?: TripProofLetterhead
  readonly logger?: { warn(message: string, metadata?: Record<string, unknown>): void }
}): Promise<{ readonly bytes: Uint8Array; readonly pages: number; readonly text: string }> {
  const stream = await createTripProofPdfGateway({ logger: input.logger ?? SILENT_LOGGER }).render({
    blocks: input.blocks,
    exportedBy: 'Ana Operadora',
    generatedAt: new Date('2026-10-07T15:00:00.000Z'),
    letterhead: input.letterhead ?? LETTERHEAD,
  })
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  return { bytes, pages: totalPages, text }
}

describe('trip-proof-pdf gateway (spec 253 T2.4)', () => {
  it('draws letterhead, info strip and the footer with page count and who exported', async () => {
    const { bytes, pages, text } = await renderPdf({
      blocks: [buildBlock('10', buildImage({ heightPx: 300, widthPx: 600 }))],
    })
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF')
    expect(pages).toBe(1)
    expect(text).toContain('Transportadora Ada')
    expect(text).toContain('NF-e 10')
    expect(text).toContain('Página 1 de 1')
    expect(text).toContain('Exportado por Ana Operadora')
    expect(text).toContain('Gerado em 07/10/2026 12:00')
  })

  it('shows "Canhoto não anexado" for a note without proof', async () => {
    const { text } = await renderPdf({ blocks: [buildBlock('11', undefined)] })
    expect(text).toContain('Canhoto não anexado')
    expect(text).toContain('NF-e 11')
  })

  it('shows "Imagem indisponível" when the image fails to read or to decode', async () => {
    const failing: TripProofImage = {
      mimeType: 'image/jpeg',
      read: async () => {
        throw new Error('storage down')
      },
    }
    const corrupt: TripProofImage = {
      mimeType: 'image/png',
      read: async () => new Uint8Array([1, 2, 3, 4]),
    }
    const { text } = await renderPdf({
      blocks: [buildBlock('12', failing), buildBlock('13', corrupt)],
    })
    expect(text.match(/Imagem indisponível/gu)).toHaveLength(2)
    expect(text).toContain('NF-e 13')
  })

  it('falls back to the placeholder and warns with ids only when embedding fails after opening', async () => {
    const warnings: { message: string; metadata: unknown }[] = []
    const imageSpy = spyOn(PDFDocument.prototype, 'image').mockImplementation(() => {
      throw new Error('embed failed')
    })
    try {
      const { text } = await renderPdf({
        blocks: [buildBlock('15', buildImage({ heightPx: 800, widthPx: 400 }))],
        logger: { warn: (message, metadata) => warnings.push({ message, metadata }) },
      })
      expect(text).toContain('Imagem indisponível')
      expect(text).toContain('NF-e 15')
    } finally {
      imageSpy.mockRestore()
    }
    expect(warnings).toHaveLength(1)
    expect(Object.keys(warnings[0]?.metadata as object).sort()).toEqual(['proofIndex', 'tripId'])
  })

  it('does not even read a mime type pdfkit cannot draw', async () => {
    let wasRead = false
    const webp: TripProofImage = {
      mimeType: 'image/webp',
      read: async () => {
        wasRead = true
        return new Uint8Array()
      },
    }
    const { text } = await renderPdf({ blocks: [buildBlock('14', webp)] })
    expect(wasRead).toBe(false)
    expect(text).toContain('Imagem indisponível')
  })

  it('puts two 9 cm blocks per page and opens a new page for the next', async () => {
    const wide = (documentNumber: string) =>
      buildBlock(documentNumber, buildImage({ heightPx: 500, widthPx: 1000 }))
    const { pages, text } = await renderPdf({ blocks: ['1', '2', '3', '4', '5'].map(wide) })
    expect(pages).toBe(3)
    expect(text).toContain('Página 3 de 3')
    expect(text).toContain('NF-e 5')
  })

  it('draws a vertical photo (rotated) without breaking the page flow', async () => {
    const { pages, text } = await renderPdf({
      blocks: [
        buildBlock('20', buildImage({ heightPx: 800, widthPx: 400 })),
        buildBlock('21', buildImage({ heightPx: 800, widthPx: 400 })),
      ],
    })
    expect(pages).toBe(1)
    expect(text).toContain('NF-e 21')
  })

  it('reads images one at a time, in order', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const order: string[] = []
    const tracked = (name: string): TripProofImage => ({
      mimeType: 'image/png',
      read: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        order.push(name)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        return buildSolidPngBytes({ heightPx: 100, widthPx: 200 })
      },
    })
    await renderPdf({
      blocks: [
        buildBlock('1', tracked('a')),
        buildBlock('2', tracked('b')),
        buildBlock('3', tracked('c')),
      ],
    })
    expect(maxInFlight).toBe(1)
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('survives a corrupt logo and still emits a valid page', async () => {
    const { pages, text } = await renderPdf({
      blocks: [buildBlock('30', undefined)],
      letterhead: { ...LETTERHEAD, logoBytes: new Uint8Array([9, 9, 9]) },
    })
    expect(pages).toBe(1)
    expect(text).toContain('Transportadora Ada')
  })

  it('emits one page with only the letterhead and footer when there are no blocks', async () => {
    const { pages, text } = await renderPdf({ blocks: [] })
    expect(pages).toBe(1)
    expect(text).toContain('Página 1 de 1')
  })
})
