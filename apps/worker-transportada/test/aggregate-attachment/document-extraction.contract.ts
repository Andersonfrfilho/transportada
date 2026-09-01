/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createDocumentExtractionGateway } from '../../src/aggregate-attachment/infrastructure/document-extraction.gateway.js'
import {
  imageMimeType,
  isPdfDocument,
} from '../../src/aggregate-attachment/infrastructure/document-signature.js'
import type { AttachmentExtractionPort } from '../../src/aggregate-attachment/application/extract-attachment-fields.port.js'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const CNH_TEXT = 'NOME MARIA DE SOUSA\nN REGISTRO 01234567890\nCAT. HAB: AD\n'

function textLayerReturning(fields: Readonly<Record<string, unknown>> | null): {
  calls: number
  port: AttachmentExtractionPort
} {
  const state = { calls: 0 }
  return {
    get calls() {
      return state.calls
    },
    port: {
      extract: async () => {
        state.calls += 1
        return fields
      },
    },
  }
}

function ocrReturning(text: string) {
  const seen: string[] = []
  return {
    reader: {
      extractText: async ({ mimeType }: { bytes: Uint8Array; mimeType: string }) => {
        seen.push(mimeType)
        return text
      },
    },
    seen,
  }
}

describe('a assinatura do arquivo escolhe como ler', () => {
  test('reconhece PDF, PNG e JPEG pelos bytes, não pelo tipo declarado', () => {
    expect(isPdfDocument(PDF_BYTES)).toBe(true)
    expect(isPdfDocument(PNG_BYTES)).toBe(false)
    expect(imageMimeType(PNG_BYTES)).toBe('image/png')
    expect(imageMimeType(JPEG_BYTES)).toBe('image/jpeg')
    expect(imageMimeType(PDF_BYTES)).toBeUndefined()
  })

  test('PDF vai para a camada de texto, nunca para o OCR', async () => {
    const textLayer = textLayerReturning({ cnpj: '30213061000106' })
    const ocr = ocrReturning(CNH_TEXT)
    const gateway = createDocumentExtractionGateway({ ocr: ocr.reader, textLayer: textLayer.port })

    const fields = await gateway.extract({ bytes: PDF_BYTES, type: 'cnh' })

    expect(fields).toEqual({ cnpj: '30213061000106' })
    expect(textLayer.calls).toBe(1)
    expect(ocr.seen).toEqual([])
  })

  /** O `tesseract-server` não lê PDF; mandar um é round-trip sabendo que vai falhar. */
  test('imagem vai para o OCR com o mimeType tirado dos bytes', async () => {
    const textLayer = textLayerReturning(null)
    const ocr = ocrReturning(CNH_TEXT)
    const gateway = createDocumentExtractionGateway({ ocr: ocr.reader, textLayer: textLayer.port })

    await gateway.extract({ bytes: PNG_BYTES, type: 'cnh' })

    expect(ocr.seen).toEqual(['image/png'])
    expect(textLayer.calls).toBe(0)
  })
})

describe('o OCR alimenta a ficha do operador', () => {
  test('a CNH fotografada vira nome, registro e categoria', async () => {
    const gateway = createDocumentExtractionGateway({
      ocr: ocrReturning(CNH_TEXT).reader,
      textLayer: textLayerReturning(null).port,
    })

    expect(await gateway.extract({ bytes: JPEG_BYTES, type: 'cnh' })).toEqual({
      licenseCategory: 'AD',
      licenseNumber: '01234567890',
      name: 'Maria De Sousa',
    })
  })

  /**
   * Não há classificador de documento numa foto: fora da CNH, ler seria adivinhação com aparência
   * de leitura, e campo inventado vira divergência falsa contra a ficha.
   */
  test('imagem de outro tipo não vira campo nenhum, mesmo com texto legível', async () => {
    const gateway = createDocumentExtractionGateway({
      ocr: ocrReturning(CNH_TEXT).reader,
      textLayer: textLayerReturning(null).port,
    })

    expect(await gateway.extract({ bytes: PNG_BYTES, type: 'address_proof' })).toBeNull()
    expect(await gateway.extract({ bytes: PNG_BYTES, type: 'company_document' })).toBeNull()
  })

  test('OCR que não reconheceu nada grava ausência, não objeto vazio', async () => {
    const gateway = createDocumentExtractionGateway({
      ocr: ocrReturning('conta de luz, valor total 189,90').reader,
      textLayer: textLayerReturning(null).port,
    })

    expect(await gateway.extract({ bytes: PNG_BYTES, type: 'cnh' })).toBeNull()
  })

  /** Sem `AGGREGATE_DOCUMENT_OCR_URL` a leitura some, e o anexo segue para a revisão manual. */
  test('sem serviço de OCR configurado, a imagem grava ausência em vez de falhar', async () => {
    const gateway = createDocumentExtractionGateway({ textLayer: textLayerReturning(null).port })

    expect(await gateway.extract({ bytes: PNG_BYTES, type: 'cnh' })).toBeNull()
  })

  test('formato de imagem desconhecido não é enviado ao serviço', async () => {
    const ocr = ocrReturning(CNH_TEXT)
    const gateway = createDocumentExtractionGateway({
      ocr: ocr.reader,
      textLayer: textLayerReturning(null).port,
    })

    expect(await gateway.extract({ bytes: new Uint8Array([1, 2, 3, 4]), type: 'cnh' })).toBeNull()
    expect(ocr.seen).toEqual([])
  })
})
