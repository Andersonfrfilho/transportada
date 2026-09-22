/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  capOccurrenceAttachments,
  resolveOccurrenceAttachmentDisplay,
  resolveOccurrenceAttachmentOriginal,
} from '@/modules/trip/shared/occurrenceAttachmentGrid.service'
import { isEveryItem, isOccurrenceAttachment } from '@/modules/trip/shared/tripGuards.validation'
import type { OccurrenceAttachment } from '@/modules/trip/shared/trip.types'

function expiredAttachment(overrides: Partial<OccurrenceAttachment> = {}): OccurrenceAttachment {
  return {
    expired: true,
    id: 'attachment-expired',
    mimeType: 'image/jpeg',
    position: 1,
    ...overrides,
  }
}

describe('spec 161 T24 — anexo expirado (D11): selo, nunca `<img>` (RF32)', () => {
  test('expired: true vira selo, sem nenhuma URL para desenhar', () => {
    expect(resolveOccurrenceAttachmentDisplay(expiredAttachment())).toEqual({ kind: 'expired' })
  })

  test('mesmo se a API mandasse alguma URL num anexo expirado, o selo prevalece — nunca `<img>`', () => {
    const display = resolveOccurrenceAttachmentDisplay(
      expiredAttachment({
        downloadUrl: 'https://storage.test/original.jpg',
        thumbnailUrl: 'https://storage.test/thumb.jpg',
      }),
    )

    expect(display.kind).toBe('expired')
  })

  test('sem `downloadUrl`, não há original para abrir em tela cheia', () => {
    expect(resolveOccurrenceAttachmentOriginal(expiredAttachment())).toBeNull()
  })

  test('a guarda aceita o anexo expirado sem nenhuma das duas URLs (RF8/D11)', () => {
    expect(isOccurrenceAttachment(expiredAttachment())).toBe(true)
  })

  test('uma ocorrência com anexos expirados e vivos mistura os dois sem derrubar a grade', () => {
    const attachments = [
      expiredAttachment({ id: 'a' }),
      {
        ...expiredAttachment({ id: 'b' }),
        expired: false,
        thumbnailUrl: 'https://storage.test/b.jpg',
      },
    ]

    expect(isEveryItem(attachments, isOccurrenceAttachment)).toBe(true)
    const [expired, alive] = capOccurrenceAttachments(attachments)
    expect(resolveOccurrenceAttachmentDisplay(expired!).kind).toBe('expired')
    expect(resolveOccurrenceAttachmentDisplay(alive!).kind).toBe('image')
  })
})

describe('spec 161 T24 — `attachments` ausente no payload não quebra a tela (CA6b)', () => {
  test('lista vazia produz grade vazia, sem lançar', () => {
    expect(capOccurrenceAttachments([])).toEqual([])
  })
})
