/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveOccurrenceAttachmentDisplay } from '@/modules/trip/shared/occurrenceAttachmentGrid.service'
import {
  buildOccurrencePhotoAttachment,
  isOccurrencePdfMimeType,
  OCCURRENCE_ATTACHMENT_ACCEPT,
  OCCURRENCE_PDF_MIME_TYPE,
} from '@/modules/trip/shared/occurrencePhotoImage.service'
import type { OccurrenceAttachment } from '@/modules/trip/shared/trip.types'

function pdfAttachment(overrides: Partial<OccurrenceAttachment> = {}): OccurrenceAttachment {
  return {
    downloadUrl: 'https://storage.test/laudo.pdf',
    expired: false,
    id: 'attachment-pdf',
    mimeType: OCCURRENCE_PDF_MIME_TYPE,
    position: 2,
    ...overrides,
  }
}

describe('o seletor aceita PDF', () => {
  test('o `accept` oferece foto e PDF', () => {
    expect(OCCURRENCE_ATTACHMENT_ACCEPT).toBe('image/*,application/pdf')
  })

  test('o tipo é reconhecido mesmo com parâmetro na declaração', () => {
    expect(isOccurrencePdfMimeType('application/pdf')).toBe(true)
    expect(isOccurrencePdfMimeType('Application/PDF; charset=binary')).toBe(true)
    expect(isOccurrencePdfMimeType('image/jpeg')).toBe(false)
  })
})

describe('o PDF entra como está — sem reencode e sem miniatura', () => {
  test('o original é o próprio arquivo escolhido, byte a byte', async () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'laudo.pdf', {
      type: OCCURRENCE_PDF_MIME_TYPE,
    })

    const attachment = await buildOccurrencePhotoAttachment(file)

    expect(attachment.original).toBe(file)
    expect(attachment.thumbnail).toBeUndefined()
  })
})

describe('PDF nunca é desenhado em `<img>`', () => {
  test('o anexo PDF vira documento com a URL do original', () => {
    expect(resolveOccurrenceAttachmentDisplay(pdfAttachment())).toEqual({
      kind: 'document',
      url: 'https://storage.test/laudo.pdf',
    })
  })

  test('uma miniatura que a API mandasse por engano não faz o PDF virar imagem', () => {
    const display = resolveOccurrenceAttachmentDisplay(
      pdfAttachment({ thumbnailUrl: 'https://storage.test/thumb.jpg' }),
    )

    expect(display.kind).toBe('document')
  })

  test('PDF sem original a oferecer não vira `<img>` — vira indisponível', () => {
    const semUrl: OccurrenceAttachment = {
      expired: false,
      id: 'attachment-pdf-sem-url',
      mimeType: OCCURRENCE_PDF_MIME_TYPE,
      position: 1,
    }

    expect(resolveOccurrenceAttachmentDisplay(semUrl)).toEqual({ kind: 'unavailable' })
  })

  test('a retenção vencida continua ganhando o selo, PDF ou foto', () => {
    expect(resolveOccurrenceAttachmentDisplay(pdfAttachment({ expired: true })).kind).toBe(
      'expired',
    )
  })
})
