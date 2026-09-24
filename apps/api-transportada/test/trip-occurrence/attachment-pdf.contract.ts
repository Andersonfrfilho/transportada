/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O anexo da ocorrência aceita PDF; o canhoto de entrega **não**. São duas listas de propósito: o
 * canhoto é foto tirada no celular do motorista, e abrir PDF ali daria ao aparelho um caminho de
 * arquivo que ninguém pediu. A separação também garante que mexer numa lista nunca mexe na outra.
 */
import { describe, expect, test } from 'bun:test'

import {
  DELIVERY_PROOF_MIME_TYPES,
  isDeliveryProofMimeType,
} from '../../src/trips/domain/delivery-proof.policy.js'
import {
  assertOccurrenceAttachmentAccepted,
  isOccurrenceAttachmentMimeType,
  OCCURRENCE_ATTACHMENT_MIME_TYPES,
  OCCURRENCE_PDF_MAX_BYTES,
  OCCURRENCE_PHOTO_MAX_BYTES,
} from '../../src/trips/domain/occurrence-attachment.policy.js'
import { APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES } from '../../src/shared/api.constant.js'

const JPEG_HEADER = [0xff, 0xd8, 0xff]
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]

function bytesOf(header: readonly number[], totalLength: number): Uint8Array {
  const bytes = new Uint8Array(totalLength)
  bytes.set(header, 0)
  return bytes
}

function jpeg(totalLength = 64): Uint8Array {
  return bytesOf(JPEG_HEADER, totalLength)
}

function pdf(totalLength = 64): Uint8Array {
  return bytesOf(PDF_HEADER, totalLength)
}

function rejectionOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    return (error as { readonly code: string }).code
  }
  throw new Error('esperava recusa, e nada foi lançado')
}

describe('o anexo da ocorrência aceita PDF, o canhoto não', () => {
  test('a lista da ocorrência é a do canhoto mais application/pdf', () => {
    expect([...OCCURRENCE_ATTACHMENT_MIME_TYPES]).toEqual([
      ...DELIVERY_PROOF_MIME_TYPES,
      'application/pdf',
    ])
  })

  test('o canhoto de entrega continua sem PDF', () => {
    expect(isDeliveryProofMimeType('application/pdf')).toBe(false)
    expect(isOccurrenceAttachmentMimeType('application/pdf')).toBe(true)
  })

  test('tipo fora das duas listas é recusado dos dois lados', () => {
    expect(isOccurrenceAttachmentMimeType('image/gif')).toBe(false)
    expect(isOccurrenceAttachmentMimeType('application/zip')).toBe(false)
  })

  /**
   * O corpo inteiro da requisição para em 1 MiB antes da rota; o PDF tem de caber nele **com** os
   * campos de texto e as fronteiras do multipart. 128 KiB de folga é o mesmo raciocínio do teto do
   * canhoto do escritório, com margem maior porque aqui vão `productCodes` repetidos.
   */
  test('o teto do PDF é maior que o da foto e cabe no limite de corpo do servidor', () => {
    expect(OCCURRENCE_PDF_MAX_BYTES).toBe(896 * 1024)
    expect(OCCURRENCE_PDF_MAX_BYTES).toBeGreaterThan(OCCURRENCE_PHOTO_MAX_BYTES)
    expect(OCCURRENCE_PDF_MAX_BYTES).toBeLessThan(APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES)
    expect(APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES - OCCURRENCE_PDF_MAX_BYTES).toBe(128 * 1024)
  })

  test('PDF com assinatura %PDF- é aceito', () => {
    expect(() =>
      assertOccurrenceAttachmentAccepted({
        bytes: pdf(),
        imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
        mimeType: 'application/pdf',
      }),
    ).not.toThrow()
  })

  /** `content-type` é o que o cliente disse; os bytes são o que ele mandou. */
  test('PDF declarado sem os bytes de PDF é recusado', () => {
    expect(
      rejectionOf(() =>
        assertOccurrenceAttachmentAccepted({
          bytes: jpeg(),
          imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
          mimeType: 'application/pdf',
        }),
      ),
    ).toBe('TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE')
  })

  test('o PDF usa o teto do PDF, não o da foto', () => {
    expect(() =>
      assertOccurrenceAttachmentAccepted({
        bytes: pdf(OCCURRENCE_PHOTO_MAX_BYTES + 1),
        imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
        mimeType: 'application/pdf',
      }),
    ).not.toThrow()

    expect(
      rejectionOf(() =>
        assertOccurrenceAttachmentAccepted({
          bytes: pdf(OCCURRENCE_PDF_MAX_BYTES + 1),
          imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
          mimeType: 'application/pdf',
        }),
      ),
    ).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
  })

  test('a foto continua com o teto da foto', () => {
    expect(
      rejectionOf(() =>
        assertOccurrenceAttachmentAccepted({
          bytes: jpeg(OCCURRENCE_PHOTO_MAX_BYTES + 1),
          imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
          mimeType: 'image/jpeg',
        }),
      ),
    ).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
  })

  /**
   * RF29b/RF32b: a miniatura é cache, nunca prova. PDF não tem miniatura, e o caminho de leitura já
   * lida com `thumbnail: null` — enviar PDF sem miniatura é o caso normal.
   */
  test('PDF sem miniatura é o caso normal', () => {
    expect(() =>
      assertOccurrenceAttachmentAccepted({
        bytes: pdf(),
        imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
        mimeType: 'application/pdf',
      }),
    ).not.toThrow()
  })

  test('miniatura junto de um PDF é recusada com código próprio', () => {
    expect(
      rejectionOf(() =>
        assertOccurrenceAttachmentAccepted({
          bytes: pdf(),
          imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
          mimeType: 'application/pdf',
          thumbnail: { bytes: jpeg(), mimeType: 'image/jpeg' },
        }),
      ),
    ).toBe('OCCURRENCE_PDF_HAS_NO_THUMBNAIL')
  })

  test('a miniatura da foto continua sendo só imagem', () => {
    expect(
      rejectionOf(() =>
        assertOccurrenceAttachmentAccepted({
          bytes: jpeg(),
          imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
          mimeType: 'image/jpeg',
          thumbnail: { bytes: pdf(), mimeType: 'application/pdf' },
        }),
      ),
    ).toBe('TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE')
  })

  test('foto com miniatura de imagem continua aceita', () => {
    expect(() =>
      assertOccurrenceAttachmentAccepted({
        bytes: jpeg(),
        imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
        mimeType: 'image/jpeg',
        thumbnail: { bytes: jpeg(), mimeType: 'image/jpeg' },
      }),
    ).not.toThrow()
  })
})
