/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T5.1 (RF21): a ordem e a navegação do visualizador, provadas na função pura.
 */
import { describe, expect, it } from 'bun:test'

import type {
  DeliveryProof,
  DeliveryProofKind,
} from '../../src/modules/trip/shared/deliveryProof.service'
import { resolveDeliveryProofView } from '../../src/modules/trip/shared/deliveryProof.service'
import {
  buildDeliveryProofGallery,
  resolveDeliveryProofGalleryNavigation,
  resolveDeliveryProofGalleryStartIndex,
} from '../../src/modules/trip/shared/deliveryProofGallery.service'

function makeProof(
  id: string,
  kind: DeliveryProofKind,
  downloadUrl = `https://x/${id}`,
): DeliveryProof {
  return {
    createdAt: '2026-09-30T10:00:00Z',
    downloadUrl,
    expiresAt: '2026-09-30T10:05:00Z',
    id,
    kind,
    receiverName: '',
  }
}

function makeView(proofs: readonly DeliveryProof[]): ReturnType<typeof resolveDeliveryProofView> {
  return resolveDeliveryProofView({
    document: {
      deliveredAt: '2026-09-30T10:00:00Z',
      returnedAt: null,
      returnReason: null,
      separationStatus: 'delivered',
    },
    proofs,
  })
}

describe('galeria do comprovante (spec 220 RF21)', () => {
  it('ordena canhoto, depois assinatura, depois mercadoria, mantendo a ordem da tela em cada grupo', () => {
    const view = makeView([
      makeProof('signature-1', 'signature'),
      makeProof('cargo-1', 'cargo'),
      makeProof('receipt-1', 'photo'),
      makeProof('cargo-2', 'cargo'),
      makeProof('receipt-2', 'photo'),
    ])

    expect(buildDeliveryProofGallery(view).map((proof) => proof.id)).toEqual([
      'receipt-1',
      'receipt-2',
      'signature-1',
      'cargo-1',
      'cargo-2',
    ])
  })

  it('não põe na galeria o comprovante sem imagem', () => {
    const view = makeView([makeProof('receipt-1', 'photo', ''), makeProof('cargo-1', 'cargo')])

    expect(buildDeliveryProofGallery(view).map((proof) => proof.id)).toEqual(['cargo-1'])
  })

  it('o índice inicial é o da imagem clicada', () => {
    const gallery = buildDeliveryProofGallery(
      makeView([
        makeProof('receipt-1', 'photo'),
        makeProof('cargo-1', 'cargo'),
        makeProof('signature-1', 'signature'),
      ]),
    )

    expect(resolveDeliveryProofGalleryStartIndex({ gallery, proofId: 'signature-1' })).toBe(1)
    expect(resolveDeliveryProofGalleryStartIndex({ gallery, proofId: 'cargo-1' })).toBe(2)
  })

  it('com uma imagem só não há anterior nem próxima', () => {
    expect(resolveDeliveryProofGalleryNavigation({ count: 1, currentIndex: 0 })).toEqual({
      canGoNext: false,
      canGoPrevious: false,
      hasNavigation: false,
      nextIndex: 0,
      previousIndex: 0,
    })
  })

  it('no meio anda para os dois lados', () => {
    expect(resolveDeliveryProofGalleryNavigation({ count: 3, currentIndex: 1 })).toEqual({
      canGoNext: true,
      canGoPrevious: true,
      hasNavigation: true,
      nextIndex: 2,
      previousIndex: 0,
    })
  })

  it('na primeira imagem não volta e não dá a volta', () => {
    const navigation = resolveDeliveryProofGalleryNavigation({ count: 3, currentIndex: 0 })

    expect(navigation.canGoPrevious).toBe(false)
    expect(navigation.previousIndex).toBe(0)
    expect(navigation.canGoNext).toBe(true)
  })

  it('na última imagem não avança e não dá a volta', () => {
    const navigation = resolveDeliveryProofGalleryNavigation({ count: 3, currentIndex: 2 })

    expect(navigation.canGoNext).toBe(false)
    expect(navigation.nextIndex).toBe(2)
    expect(navigation.canGoPrevious).toBe(true)
  })
})
