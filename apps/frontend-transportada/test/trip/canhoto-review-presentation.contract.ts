/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import type { DeliveryProof } from '@/modules/trip/shared/deliveryProof.service'
import { presentCanhotoReview } from '@/modules/trip/shared/canhotoReviewPresentation.service'

const BASE_PROOF: DeliveryProof = {
  createdAt: '2026-09-25T12:01:00.000Z',
  downloadUrl: 'https://bucket.example/p1.jpg',
  expiresAt: '2026-09-25T12:06:00.000Z',
  id: 'p1',
  kind: 'photo',
  receiverName: 'Maria',
}

describe('presentCanhotoReview (spec 220 T7.6)', () => {
  it('sem veredito não mostra nada', () => {
    expect(presentCanhotoReview(BASE_PROOF)).toBeUndefined()
  })

  it('aprovado automaticamente diz "conferido automaticamente", sem quem nem quando', () => {
    const presentation = presentCanhotoReview({
      ...BASE_PROOF,
      canhotoReadNumber: '000009000',
      canhotoReadSeries: '001',
      canhotoReadSource: 'barcode',
      canhotoReview: 'approved',
      canhotoReviewOrigin: 'automatic',
    })
    expect(presentation).toEqual({ isExperimental: false, messageKey: 'approvedAutomatic' })
  })

  it('aprovado por pessoa traz quem e quando, sem formatar a data', () => {
    const presentation = presentCanhotoReview({
      ...BASE_PROOF,
      canhotoReview: 'approved',
      canhotoReviewAt: '2026-09-25T13:00:00.000Z',
      canhotoReviewByName: 'Carlos Operador',
      canhotoReviewOrigin: 'manual',
    })
    expect(presentation).toEqual({
      isExperimental: false,
      messageKey: 'approvedManual',
      reviewedAt: '2026-09-25T13:00:00.000Z',
      reviewerName: 'Carlos Operador',
    })
  })

  it('pendente com OCR mostra o número lido e o selo Experimental', () => {
    const presentation = presentCanhotoReview({
      ...BASE_PROOF,
      canhotoReadNumber: '000009000',
      canhotoReadSeries: '001',
      canhotoReadSource: 'ocr',
      canhotoReview: 'pending',
    })
    expect(presentation).toEqual({
      isExperimental: true,
      messageKey: 'pendingOcr',
      readNumber: '9000/1',
    })
  })

  it('pendente com código de barras mostra o número e a nota que ele aponta, sem selo', () => {
    const presentation = presentCanhotoReview({
      ...BASE_PROOF,
      canhotoReadNumber: '000009000',
      canhotoReadSource: 'barcode',
      canhotoReview: 'pending',
    })
    expect(presentation).toEqual({
      isExperimental: false,
      messageKey: 'pendingBarcode',
      readNumber: '9000',
    })
  })

  it('pendente sem leitura é "aguardando conferência"', () => {
    const presentation = presentCanhotoReview({ ...BASE_PROOF, canhotoReview: 'pending' })
    expect(presentation).toEqual({ isExperimental: false, messageKey: 'pendingUnread' })
  })

  it('recusado com motivo da lista fechada mostra o motivo e esconde a nota', () => {
    const presentation = presentCanhotoReview({
      ...BASE_PROOF,
      canhotoReview: 'rejected',
      canhotoReviewNote: 'texto que não deve aparecer',
      canhotoReviewReason: 'illegible',
    })
    expect(presentation).toEqual({
      isExperimental: false,
      messageKey: 'rejected',
      reason: 'illegible',
    })
  })

  it('recusado com "outro" mostra o motivo e a nota', () => {
    const presentation = presentCanhotoReview({
      ...BASE_PROOF,
      canhotoReview: 'rejected',
      canhotoReviewNote: 'Carimbo cobre o número',
      canhotoReviewReason: 'other',
    })
    expect(presentation).toEqual({
      isExperimental: false,
      messageKey: 'rejected',
      note: 'Carimbo cobre o número',
      reason: 'other',
    })
  })

  it('recusado com "outro" sem nota não inventa a nota', () => {
    const presentation = presentCanhotoReview({
      ...BASE_PROOF,
      canhotoReview: 'rejected',
      canhotoReviewReason: 'other',
    })
    expect(presentation).toEqual({
      isExperimental: false,
      messageKey: 'rejected',
      reason: 'other',
    })
  })
})
