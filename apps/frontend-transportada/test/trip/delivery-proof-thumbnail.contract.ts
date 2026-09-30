/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  resolveDeliveryProofFullSizeUrl,
  resolveDeliveryProofImageSource,
} from '../../src/modules/trip/shared/deliveryProof.service'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const ORIGINAL_URL = 'https://bucket.example/p1.jpg?assinatura=original'
const THUMBNAIL_URL = 'https://bucket.example/p1.thumb.jpg?assinatura=miniatura'

const PROOF_WITHOUT_THUMBNAIL = {
  createdAt: '2026-09-25T12:01:00.000Z',
  downloadUrl: ORIGINAL_URL,
  expiresAt: '2026-09-25T12:06:00.000Z',
  id: 'p1',
  kind: 'photo' as const,
  receiverName: 'Maria',
}

const PROOF_WITH_THUMBNAIL = { ...PROOF_WITHOUT_THUMBNAIL, thumbnailUrl: THUMBNAIL_URL }

describe('miniatura do comprovante (spec 220 RF20, RF22)', () => {
  it('com miniatura, a imagem exibida é a miniatura', () => {
    expect(resolveDeliveryProofImageSource(PROOF_WITH_THUMBNAIL)).toBe(THUMBNAIL_URL)
  })

  it('sem miniatura (comprovante antigo, assinatura), a imagem exibida é o original', () => {
    expect(resolveDeliveryProofImageSource(PROOF_WITHOUT_THUMBNAIL)).toBe(ORIGINAL_URL)
  })

  it('RF22: a tela cheia e o download são o original, com ou sem miniatura', () => {
    expect(resolveDeliveryProofFullSizeUrl(PROOF_WITH_THUMBNAIL)).toBe(ORIGINAL_URL)
    expect(resolveDeliveryProofFullSizeUrl(PROOF_WITHOUT_THUMBNAIL)).toBe(ORIGINAL_URL)
  })

  /** A lista inválida descarta o item em silêncio: sem a chave permitida, o comprovante some da tela. */
  it('a validação da resposta aceita e preserva thumbnailUrl', () => {
    const adapters = createTripResponseAdapters()

    expect(adapters.deliveryProofsFromApi([PROOF_WITH_THUMBNAIL])).toEqual([PROOF_WITH_THUMBNAIL])
    expect(adapters.deliveryProofsFromApi([{ ...PROOF_WITH_THUMBNAIL, thumbnailUrl: 12 }])).toEqual(
      [],
    )
  })
})
