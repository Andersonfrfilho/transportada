/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: cada leitura das avarias traz URLs assinadas NOVAS, e a lista é relida a cada 20 s — sem
 * cuidado o `src` da miniatura muda a cada leitura e o navegador baixa tudo de novo. Quando o anexo é o mesmo
 * (`id`) e a assinatura que a tela já tem ainda vive com folga, a leitura nova herda a URL anterior; assinatura
 * perto de vencer, anexo novo, anexo vencido ou sem prazo conhecido usam a URL nova.
 */
import { describe, expect, test } from 'bun:test'

import { stabilizeOccurrenceAttachments } from '@/modules/cargo-receiving/shared/cargoOccurrenceAttachments.service'
import type { CargoOccurrenceAttachment } from '@/modules/cargo-receiving/shared/cargoOccurrence.types'

import { buildOccurrence, buildOccurrencesView } from '../fixtures/cargoOccurrence.fixture'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const FAR = '2026-10-06T12:15:00.000Z'
const FARTHER = '2026-10-06T12:30:00.000Z'
const NEAR = '2026-10-06T12:01:00.000Z'

const attachment = (
  overrides: Partial<CargoOccurrenceAttachment> = {},
): CargoOccurrenceAttachment => ({
  downloadUrl: 'https://files.test/a.jpg?sig=1',
  expired: false,
  expiresAt: FAR,
  id: 'att-1',
  mimeType: 'image/jpeg',
  position: 1,
  thumbnailUrl: 'https://files.test/a-thumb.jpg?sig=1',
  ...overrides,
})

const viewOf = (...attachments: CargoOccurrenceAttachment[]) =>
  buildOccurrencesView({
    occurrences: [buildOccurrence({ attachments, id: 'occ-1', nfeDocumentId: 'doc-1' })],
  })

const first = (view: ReturnType<typeof viewOf>) => view.occurrences[0]?.attachments[0]

describe('o `src` da miniatura entre leituras equivalentes', () => {
  test('mesmo anexo e assinatura anterior com folga: a URL anterior fica', () => {
    const previous = viewOf(attachment())
    const next = viewOf(
      attachment({
        downloadUrl: 'https://files.test/a.jpg?sig=2',
        expiresAt: FARTHER,
        thumbnailUrl: 'https://files.test/a-thumb.jpg?sig=2',
      }),
    )

    const merged = stabilizeOccurrenceAttachments({ next, now: NOW, previous })

    expect(first(merged)?.thumbnailUrl).toBe('https://files.test/a-thumb.jpg?sig=1')
    expect(first(merged)?.downloadUrl).toBe('https://files.test/a.jpg?sig=1')
    expect(first(merged)?.expiresAt).toBe(FAR)
  })

  test('a assinatura anterior perto de vencer cede à nova: a miniatura não pode morrer na tela', () => {
    const previous = viewOf(attachment({ expiresAt: NEAR }))
    const next = viewOf(
      attachment({
        downloadUrl: 'https://files.test/a.jpg?sig=2',
        expiresAt: FARTHER,
        thumbnailUrl: 'https://files.test/a-thumb.jpg?sig=2',
      }),
    )

    const merged = stabilizeOccurrenceAttachments({ next, now: NOW, previous })

    expect(first(merged)?.thumbnailUrl).toBe('https://files.test/a-thumb.jpg?sig=2')
  })

  test('anexo diferente (outro `id`) usa a URL dele', () => {
    const previous = viewOf(attachment({ id: 'att-1' }))
    const next = viewOf(
      attachment({ id: 'att-2', thumbnailUrl: 'https://files.test/b-thumb.jpg?sig=9' }),
    )

    expect(first(stabilizeOccurrenceAttachments({ next, now: NOW, previous }))?.thumbnailUrl).toBe(
      'https://files.test/b-thumb.jpg?sig=9',
    )
  })

  test('anexo que a leitura nova marca como vencido nunca herda URL', () => {
    const previous = viewOf(attachment())
    const next = viewOf({ expired: true, id: 'att-1', mimeType: 'image/jpeg', position: 1 })

    const merged = first(stabilizeOccurrenceAttachments({ next, now: NOW, previous }))

    expect(merged?.expired).toBe(true)
    expect(merged?.thumbnailUrl).toBeUndefined()
  })

  test('sem prazo conhecido na assinatura anterior, a nova vale: não dá para saber se ainda vive', () => {
    const withoutExpiry: CargoOccurrenceAttachment = {
      downloadUrl: 'https://files.test/a.jpg?sig=1',
      expired: false,
      id: 'att-1',
      mimeType: 'image/jpeg',
      position: 1,
      thumbnailUrl: 'https://files.test/a-thumb.jpg?sig=1',
    }
    const previous = viewOf(withoutExpiry)
    const next = viewOf(attachment({ thumbnailUrl: 'https://files.test/a-thumb.jpg?sig=2' }))

    expect(first(stabilizeOccurrenceAttachments({ next, now: NOW, previous }))?.thumbnailUrl).toBe(
      'https://files.test/a-thumb.jpg?sig=2',
    )
  })

  test('primeira leitura (sem anterior) devolve a nova como veio', () => {
    const next = viewOf(attachment())

    expect(stabilizeOccurrenceAttachments({ next, now: NOW, previous: undefined })).toEqual(next)
  })

  test('o resto da leitura (tratativa, marcação, contagens) é sempre o novo', () => {
    const previous = buildOccurrencesView({
      occurrences: [
        buildOccurrence({
          case: { id: 'c', status: 'recorded' },
          id: 'occ-1',
          nfeDocumentId: 'doc-1',
        }),
      ],
    })
    const next = buildOccurrencesView({
      occurrences: [
        buildOccurrence({
          case: { id: 'c', status: 'decided' },
          id: 'occ-1',
          nfeDocumentId: 'doc-1',
        }),
      ],
      returns: [
        { nfeDocumentId: 'doc-1', returnOccurrenceId: 'occ-1', returnToContractor: 'marked' },
      ],
    })

    const merged = stabilizeOccurrenceAttachments({ next, now: NOW, previous })

    expect(merged.occurrences[0]?.case?.status).toBe('decided')
    expect(merged.returnCounts).toEqual({ marked: 1, returned: 0 })
  })
})
