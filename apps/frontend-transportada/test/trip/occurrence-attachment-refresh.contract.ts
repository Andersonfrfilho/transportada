/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  findOccurrenceAttachmentById,
  isOccurrenceAttachmentUrlExpired,
  OCCURRENCE_ATTACHMENT_REFRESH_LIMIT,
  resolveOccurrenceAttachmentRefresh,
} from '@/modules/trip/shared/occurrenceAttachmentRefresh.service'
import { resolveOccurrenceAttachmentDisplay } from '@/modules/trip/shared/occurrenceAttachmentGrid.service'
import type { OccurrenceAttachment } from '@/modules/trip/shared/trip.types'

const NOW = Date.parse('2026-09-22T12:00:00.000Z')

function attachment(overrides: Partial<OccurrenceAttachment> = {}): OccurrenceAttachment {
  return {
    downloadUrl: 'https://storage.test/original.jpg',
    expired: false,
    expiresAt: new Date(NOW + 60_000).toISOString(),
    id: 'attachment-1',
    mimeType: 'image/jpeg',
    position: 1,
    thumbnailUrl: 'https://storage.test/thumb.jpg',
    ...overrides,
  }
}

describe('a URL assinada vencida se recupera sozinha', () => {
  test('`expiresAt` no passado é URL vencida', () => {
    const vencida = attachment({ expiresAt: new Date(NOW - 1).toISOString() })

    expect(isOccurrenceAttachmentUrlExpired(vencida, NOW)).toBe(true)
  })

  test('`expiresAt` no futuro não é vencida', () => {
    expect(isOccurrenceAttachmentUrlExpired(attachment(), NOW)).toBe(false)
  })

  test('sem `expiresAt`, ou com data ilegível, não se inventa vencimento', () => {
    const semPrazo: OccurrenceAttachment = {
      downloadUrl: 'https://storage.test/original.jpg',
      expired: false,
      id: 'attachment-sem-prazo',
      mimeType: 'image/jpeg',
      position: 1,
    }

    expect(isOccurrenceAttachmentUrlExpired(semPrazo, NOW)).toBe(false)
    expect(isOccurrenceAttachmentUrlExpired(attachment({ expiresAt: 'ontem' }), NOW)).toBe(false)
  })

  test('URL vencida pede nova busca antes mesmo de o `<img>` tentar', () => {
    const vencida = attachment({ expiresAt: new Date(NOW - 1).toISOString() })

    expect(
      resolveOccurrenceAttachmentRefresh({
        attachment: vencida,
        attemptCount: 0,
        hasErrored: false,
        now: NOW,
      }),
    ).toBe('expired')
  })

  test('`onError` do `<img>` pede nova busca mesmo com `expiresAt` no futuro', () => {
    expect(
      resolveOccurrenceAttachmentRefresh({
        attachment: attachment(),
        attemptCount: 0,
        hasErrored: true,
        now: NOW,
      }),
    ).toBe('error')
  })

  test('foto boa e dentro do prazo não busca nada', () => {
    expect(
      resolveOccurrenceAttachmentRefresh({
        attachment: attachment(),
        attemptCount: 0,
        hasErrored: false,
        now: NOW,
      }),
    ).toBeNull()
  })
})

describe('a nova busca não vira laço', () => {
  test('depois do teto de tentativas, a falha para de buscar e fica para o usuário', () => {
    expect(
      resolveOccurrenceAttachmentRefresh({
        attachment: attachment({ expiresAt: new Date(NOW - 1).toISOString() }),
        attemptCount: OCCURRENCE_ATTACHMENT_REFRESH_LIMIT,
        hasErrored: true,
        now: NOW,
      }),
    ).toBeNull()
  })

  test('anexo expirado pela retenção (D11) nunca busca — o objeto não existe mais', () => {
    const expirado: OccurrenceAttachment = {
      expired: true,
      id: 'attachment-expirado',
      mimeType: 'image/jpeg',
      position: 1,
    }

    expect(
      resolveOccurrenceAttachmentRefresh({
        attachment: expirado,
        attemptCount: 0,
        hasErrored: true,
        now: NOW,
      }),
    ).toBeNull()
    expect(resolveOccurrenceAttachmentDisplay(expirado).kind).toBe('expired')
  })
})

describe('cada foto se recupera sozinha, sem mexer nas vizinhas', () => {
  test('a releitura substitui só o anexo de mesmo id', () => {
    const relidos = [
      attachment({ id: 'a', thumbnailUrl: 'https://storage.test/a-novo.jpg' }),
      attachment({ id: 'b', thumbnailUrl: 'https://storage.test/b-novo.jpg' }),
    ]

    expect(findOccurrenceAttachmentById(relidos, 'b')?.thumbnailUrl).toBe(
      'https://storage.test/b-novo.jpg',
    )
    expect(findOccurrenceAttachmentById(relidos, 'c')).toBeUndefined()
  })

  test('a URL nova volta a desenhar a miniatura — o defeito era ficar na frase morta', () => {
    const vencida = attachment({ expiresAt: new Date(NOW - 1).toISOString() })
    const renovada = findOccurrenceAttachmentById(
      [attachment({ thumbnailUrl: 'https://storage.test/thumb-renovado.jpg' })],
      vencida.id,
    )

    expect(resolveOccurrenceAttachmentDisplay(renovada!)).toEqual({
      isThumbnail: true,
      kind: 'image',
      src: 'https://storage.test/thumb-renovado.jpg',
    })
  })
})
