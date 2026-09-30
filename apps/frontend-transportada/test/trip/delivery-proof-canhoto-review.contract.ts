/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const BASE_PROOF = {
  createdAt: '2026-09-25T12:01:00.000Z',
  downloadUrl: 'https://bucket.example/p1.jpg?assinatura=original',
  expiresAt: '2026-09-25T12:06:00.000Z',
  id: 'p1',
  kind: 'photo' as const,
  receiverName: 'Maria',
}

const HUMAN_REVIEW = {
  ...BASE_PROOF,
  canhotoReadNumber: '1234',
  canhotoReadSeries: '1',
  canhotoReadSource: 'ocr' as const,
  canhotoReview: 'rejected' as const,
  canhotoReviewAt: '2026-09-25T13:00:00.000Z',
  canhotoReviewByName: 'Carlos Operador',
  canhotoReviewNote: 'Carimbo cobre o número',
  canhotoReviewOrigin: 'manual' as const,
  canhotoReviewReason: 'other' as const,
}

const AUTOMATIC_REVIEW = {
  ...BASE_PROOF,
  canhotoReadNumber: '1234',
  canhotoReadSource: 'barcode' as const,
  canhotoReview: 'approved' as const,
  canhotoReviewAt: '2026-09-25T12:02:00.000Z',
  canhotoReviewOrigin: 'automatic' as const,
}

const PENDING_WITH_OCR = {
  ...BASE_PROOF,
  canhotoReadNumber: '1234',
  canhotoReadSource: 'ocr' as const,
  canhotoReview: 'pending' as const,
}

const PENDING_WITHOUT_READING = { ...BASE_PROOF, canhotoReview: 'pending' as const }

const OUT_OF_VOCABULARY = [
  ['canhotoReview', 'not_applicable'],
  ['canhotoReviewOrigin', 'robot'],
  ['canhotoReadSource', 'manual'],
  ['canhotoReviewReason', 'blurry'],
] as const

const WRONG_TYPE = [
  'canhotoReadNumber',
  'canhotoReadSeries',
  'canhotoReviewAt',
  'canhotoReviewByName',
  'canhotoReviewNote',
] as const

describe('conferência do canhoto no comprovante (spec 220 T7.5)', () => {
  const adapters = createTripResponseAdapters()

  it('veredito humano completo atravessa inteiro', () => {
    expect(adapters.deliveryProofsFromApi([HUMAN_REVIEW])).toEqual([HUMAN_REVIEW])
  })

  it('veredito automático, sem nome de quem conferiu, atravessa', () => {
    expect(adapters.deliveryProofsFromApi([AUTOMATIC_REVIEW])).toEqual([AUTOMATIC_REVIEW])
  })

  it('pending com leitura por ocr e pending sem leitura nenhuma atravessam', () => {
    expect(adapters.deliveryProofsFromApi([PENDING_WITH_OCR, PENDING_WITHOUT_READING])).toEqual([
      PENDING_WITH_OCR,
      PENDING_WITHOUT_READING,
    ])
  })

  it('comprovante da API antiga, sem nenhuma chave nova, continua válido', () => {
    expect(adapters.deliveryProofsFromApi([BASE_PROOF])).toEqual([BASE_PROOF])
  })

  for (const [field, value] of OUT_OF_VOCABULARY) {
    it(`${field} fora do vocabulário descarta o comprovante`, () => {
      expect(adapters.deliveryProofsFromApi([{ ...HUMAN_REVIEW, [field]: value }])).toEqual([])
    })
  }

  for (const field of WRONG_TYPE) {
    it(`${field} com número no lugar de texto descarta o comprovante`, () => {
      expect(adapters.deliveryProofsFromApi([{ ...HUMAN_REVIEW, [field]: 12 }])).toEqual([])
    })
  }

  it('a chave crua do autor e a do documento lido não existem no painel', () => {
    expect(
      adapters.deliveryProofsFromApi([{ ...HUMAN_REVIEW, canhotoReviewByUserId: 'u1' }]),
    ).toEqual([])
    expect(
      adapters.deliveryProofsFromApi([{ ...HUMAN_REVIEW, canhotoReadDocumentId: 'd1' }]),
    ).toEqual([])
  })
})
