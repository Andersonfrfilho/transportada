/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { readPdfTextLayer } from '@/modules/document-intake/shared/pdfTextLayer.service'

import { buildTextPdf, getLegacyDocument } from './crlv-pdf.helper'

describe('a camada de texto do PDF', () => {
  it('devolve cada fragmento na coordenada em que ele foi impresso', async () => {
    const page = await readPdfTextLayer({
      data: buildTextPdf([
        { text: 'PLACA', x: 60, y: 700 },
        { text: 'GCQ8E47', x: 62, y: 686 },
      ]),
      getDocument: getLegacyDocument,
    })

    expect(page.fragments).toHaveLength(2)
    expect(page.fragments[0]).toMatchObject({ text: 'PLACA', x: 60, y: 700 })
    expect(page.fragments[1]).toMatchObject({ text: 'GCQ8E47', x: 62, y: 686 })
    expect(page.height).toBe(842)
  })

  it('descarta os fragmentos vazios que o pdf.js intercala', async () => {
    const page = await readPdfTextLayer({
      data: buildTextPdf([
        { text: 'PLACA', x: 60, y: 700 },
        { text: '   ', x: 60, y: 694 },
        { text: 'GCQ8E47', x: 62, y: 686 },
      ]),
      getDocument: getLegacyDocument,
    })

    expect(page.fragments.map((fragment) => fragment.text)).toEqual(['PLACA', 'GCQ8E47'])
  })

  it('devolve página sem fragmento quando o PDF não tem camada de texto', async () => {
    const page = await readPdfTextLayer({ data: buildTextPdf([]), getDocument: getLegacyDocument })

    expect(page.fragments).toHaveLength(0)
  })
})
