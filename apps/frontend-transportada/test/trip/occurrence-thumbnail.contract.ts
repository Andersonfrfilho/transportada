/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  capOccurrenceAttachments,
  OCCURRENCE_ATTACHMENT_GRID_LIMIT,
  resolveOccurrenceAttachmentDisplay,
  resolveOccurrenceAttachmentOriginal,
} from '@/modules/trip/shared/occurrenceAttachmentGrid.service'
import { isOccurrenceAttachment } from '@/modules/trip/shared/tripGuards.validation'
import type { OccurrenceAttachment } from '@/modules/trip/shared/trip.types'

type AttachmentOverrides = {
  [TKey in keyof OccurrenceAttachment]?: OccurrenceAttachment[TKey] | undefined
}

function attachment(overrides: AttachmentOverrides = {}): OccurrenceAttachment {
  const merged = {
    downloadUrl: 'https://storage.test/original.jpg',
    expired: false,
    expiresAt: '2026-09-21T10:05:00.000Z',
    id: 'attachment-1',
    mimeType: 'image/jpeg',
    position: 1,
    thumbnailUrl: 'https://storage.test/thumb.jpg',
    ...overrides,
  }
  return Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  ) as unknown as OccurrenceAttachment
}

describe('spec 161 T24 — grade pede a miniatura, o original só entra ao abrir (CA6b)', () => {
  test('com miniatura, a grade desenha a miniatura — nunca o original', () => {
    const display = resolveOccurrenceAttachmentDisplay(attachment())

    expect(display).toEqual({
      isThumbnail: true,
      kind: 'image',
      src: 'https://storage.test/thumb.jpg',
    })
  })

  test('sem miniatura (foto de WhatsApp, D14), a grade cai para o original — nunca some (RF32b)', () => {
    const display = resolveOccurrenceAttachmentDisplay(attachment({ thumbnailUrl: undefined }))

    expect(display).toEqual({
      isThumbnail: false,
      kind: 'image',
      src: 'https://storage.test/original.jpg',
    })
  })

  test('sem miniatura e sem original, a grade não inventa um `src` — vira selo de indisponível', () => {
    const display = resolveOccurrenceAttachmentDisplay(
      attachment({ downloadUrl: undefined, thumbnailUrl: undefined }),
    )

    expect(display).toEqual({ kind: 'unavailable' })
  })

  test('abrir a foto em tela cheia usa sempre o original, mesmo quando a grade mostra a miniatura', () => {
    expect(resolveOccurrenceAttachmentOriginal(attachment())).toBe(
      'https://storage.test/original.jpg',
    )
  })

  test('sem `downloadUrl`, não há o que abrir em tela cheia', () => {
    expect(resolveOccurrenceAttachmentOriginal(attachment({ downloadUrl: undefined }))).toBeNull()
  })

  test('a grade tem no máximo cinco fotos (RF14/D2) — sexta em diante não entra', () => {
    const attachments = Array.from({ length: 7 }, (_, index) =>
      attachment({ id: `attachment-${index + 1}`, position: index + 1 }),
    )

    const visible = capOccurrenceAttachments(attachments)

    expect(visible).toHaveLength(OCCURRENCE_ATTACHMENT_GRID_LIMIT)
    expect(visible.map((item) => item.id)).toEqual([
      'attachment-1',
      'attachment-2',
      'attachment-3',
      'attachment-4',
      'attachment-5',
    ])
  })

  test('grade com menos de cinco fotos não é completada — devolve exatamente o que existe', () => {
    const attachments = [attachment({ id: 'a' }), attachment({ id: 'b' })]

    expect(capOccurrenceAttachments(attachments)).toHaveLength(2)
  })
})

describe('spec 161 T24 — a guarda do anexo (RF8) protege as três telas contra formato inesperado', () => {
  test('aceita o formato completo, com as duas URLs presigned', () => {
    expect(isOccurrenceAttachment(attachment())).toBe(true)
  })

  test('aceita o formato mínimo — miniatura de WhatsApp não tem thumbnailUrl nem expiresAt', () => {
    expect(
      isOccurrenceAttachment({
        downloadUrl: 'https://storage.test/original.jpg',
        expired: false,
        id: 'attachment-1',
        mimeType: 'image/jpeg',
        position: 1,
      }),
    ).toBe(true)
  })

  test('recusa campo obrigatório ausente', () => {
    const { mimeType, ...withoutMimeType } = attachment()
    expect(mimeType).not.toBe('')
    expect(isOccurrenceAttachment(withoutMimeType)).toBe(false)
  })

  test('recusa chave desconhecida — `objectKey`/`bucket` nunca deveriam sair no JSON (RF8)', () => {
    expect(isOccurrenceAttachment({ ...attachment(), bucket: 'trip-occurrences' })).toBe(false)
  })

  test('recusa `position` não numérico', () => {
    expect(isOccurrenceAttachment({ ...attachment(), position: '1' })).toBe(false)
  })
})
