/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregateDocumentTextGateway } from '../../src/fleet/infrastructure/aggregate-document-text.gateway.js'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71])

describe('aggregate document text reader dispatch', () => {
  test('sends an image to the OCR service', async () => {
    const seen: string[] = []
    const reader = createAggregateDocumentTextGateway({
      ocr: {
        extractText: async ({ mimeType }) => {
          seen.push(mimeType)
          return 'texto do OCR'
        },
      },
    })

    const text = await reader.extractText({ bytes: PNG_BYTES, mimeType: 'image/png' })

    expect(seen).toEqual(['image/png'])
    expect(text).toBe('texto do OCR')
  })

  /** O OCR self-hosted não lê PDF (`Pdf reading is not supported`): mandar seria round-trip perdido. */
  test('never sends a PDF to the OCR service', async () => {
    let called = false
    const reader = createAggregateDocumentTextGateway({
      ocr: {
        extractText: async () => {
          called = true
          return 'não deveria ter sido chamado'
        },
      },
    })

    await reader.extractText({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf' })

    expect(called).toBe(false)
  })

  /** Sem OCR configurado o PDF continua sendo lido: a camada de texto não depende do serviço. */
  test('reads a PDF even with no OCR service configured', async () => {
    const reader = createAggregateDocumentTextGateway({})

    const text = await reader.extractText({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'application/pdf',
    })

    expect(text).toBe('')
  })

  /** Sem OCR, imagem é ausência de texto — nunca exceção, que derrubaria o upload já salvo. */
  test('reports absence for an image when no OCR service is configured', async () => {
    const reader = createAggregateDocumentTextGateway({})

    const text = await reader.extractText({ bytes: PNG_BYTES, mimeType: 'image/png' })

    expect(text).toBe('')
  })
})
