/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: a lista das avarias é relida a cada 20 s e cada leitura traz URLs assinadas novas — com o `src`
 * trocado a cada releitura o navegador baixava todas as miniaturas de novo. Numa releitura EQUIVALENTE (mesmo
 * anexo, assinatura de antes ainda com folga) o `src` não muda; muda quando o anexo é outro, quando a assinatura
 * de antes está perto de vencer e quando a leitura nova marca o anexo como vencido.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { CargoOccurrenceAttachment } from '@/modules/cargo-receiving/shared/cargoOccurrence.types'

import { buildOccurrence } from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { mountOffice, stubVisibleLayout, text } from './cargoOccurrenceScreen.helper'
import { settle, waitFor } from './renderHook.helper'

const DOC = documentIdOf(1001)
const MINUTE = 60_000

const signed = (input: {
  id?: string
  minutesLeft: number
  signature: string
}): CargoOccurrenceAttachment => ({
  downloadUrl: `https://files.test/a.jpg?sig=${input.signature}`,
  expired: false,
  expiresAt: new Date(Date.now() + input.minutesLeft * MINUTE).toISOString(),
  id: input.id ?? 'att-1',
  mimeType: 'image/jpeg',
  position: 1,
  thumbnailUrl: `https://files.test/a-thumb.jpg?sig=${input.signature}`,
})

const withAttachment = (attachment: CargoOccurrenceAttachment) =>
  buildOccurrence({ attachments: [attachment], id: 'occ-1', nfeDocumentId: DOC })

const thumbSource = (): string | null =>
  document.querySelector('[data-occurrence-id="occ-1"] img')?.getAttribute('src') ?? null

let restoreLayout: () => void = () => undefined

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
})

afterEach(() => restoreLayout())

async function mountWith(attachment: CargoOccurrenceAttachment) {
  return mountOffice({ occurrence: { occurrences: [withAttachment(attachment)] } })
}

describe('o `src` da miniatura entre releituras', () => {
  test('releitura equivalente (mesmo anexo, URL nova, folga de sobra): o `src` não muda', async () => {
    const { occurrence, rendered } = await mountWith(signed({ minutesLeft: 14, signature: '1' }))
    expect(thumbSource()).toBe('https://files.test/a-thumb.jpg?sig=1')
    const readsBefore = occurrence.calls.listOccurrences

    occurrence.occurrences = [withAttachment(signed({ minutesLeft: 29, signature: '2' }))]
    await rendered.queryClient.invalidateQueries()
    await waitFor(() => expect(occurrence.calls.listOccurrences).toBeGreaterThan(readsBefore))
    await settle()

    expect(thumbSource()).toBe('https://files.test/a-thumb.jpg?sig=1')
    rendered.unmount()
  })

  test('várias releituras seguidas continuam com a mesma URL', async () => {
    const { occurrence, rendered } = await mountWith(signed({ minutesLeft: 14, signature: '1' }))

    for (const signature of ['2', '3', '4']) {
      occurrence.occurrences = [withAttachment(signed({ minutesLeft: 14, signature }))]
      await rendered.queryClient.invalidateQueries()
      await settle()
    }

    expect(thumbSource()).toBe('https://files.test/a-thumb.jpg?sig=1')
    rendered.unmount()
  })

  test('a assinatura de antes perto de vencer cede à nova: a miniatura não morre na tela', async () => {
    const { occurrence, rendered } = await mountWith(signed({ minutesLeft: 1, signature: '1' }))

    occurrence.occurrences = [withAttachment(signed({ minutesLeft: 15, signature: '2' }))]
    await rendered.queryClient.invalidateQueries()

    await waitFor(() => expect(thumbSource()).toBe('https://files.test/a-thumb.jpg?sig=2'))
    rendered.unmount()
  })

  test('anexo diferente (outro `id`) mostra a foto dele', async () => {
    const { occurrence, rendered } = await mountWith(signed({ minutesLeft: 14, signature: '1' }))

    occurrence.occurrences = [
      withAttachment(signed({ id: 'att-2', minutesLeft: 14, signature: '9' })),
    ]
    await rendered.queryClient.invalidateQueries()

    await waitFor(() => expect(thumbSource()).toBe('https://files.test/a-thumb.jpg?sig=9'))
    rendered.unmount()
  })

  test('a leitura que marca o anexo como vencido tira a imagem e avisa', async () => {
    const { occurrence, rendered } = await mountWith(signed({ minutesLeft: 14, signature: '1' }))

    occurrence.occurrences = [
      withAttachment({ expired: true, id: 'att-1', mimeType: 'image/jpeg', position: 1 }),
    ]
    await rendered.queryClient.invalidateQueries()

    await waitFor(() => expect(text()).toContain('A foto não está mais disponível'))
    expect(thumbSource()).toBeNull()
    rendered.unmount()
  })

  test('o resto da leitura continua novo: a situação da tratativa muda mesmo com a foto estável', async () => {
    const { occurrence, rendered } = await mountWith(signed({ minutesLeft: 14, signature: '1' }))

    occurrence.occurrences = [
      {
        ...withAttachment(signed({ minutesLeft: 29, signature: '2' })),
        case: { id: 'case-1', status: 'under_review' },
      },
    ]
    await rendered.queryClient.invalidateQueries()

    await waitFor(() => expect(text()).toContain('Em análise'))
    expect(thumbSource()).toBe('https://files.test/a-thumb.jpg?sig=1')
    rendered.unmount()
  })
})
