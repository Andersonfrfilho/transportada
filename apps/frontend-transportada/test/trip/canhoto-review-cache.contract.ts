/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.11: a view do PATCH não é o `DeliveryProof`. O que entra no cache de
 * `deliveryProofsQuery` segue a forma do GET — chave ausente, sem `not_applicable`, sem o nome de
 * quem conferiu antes.
 */
import { describe, expect, test } from 'bun:test'

import { applyCanhotoReviewResult } from '../../src/modules/trip/shared/canhotoReviewCache.service'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'

const RECEIPT: DeliveryProof = {
  canhotoReadNumber: '123456',
  canhotoReadSource: 'ocr',
  canhotoReview: 'pending',
  createdAt: '2026-09-30T10:00:00Z',
  downloadUrl: 'https://storage.test/original/receipt',
  expiresAt: '2026-09-30T10:05:00Z',
  id: 'proof-receipt',
  kind: 'photo',
  receiverName: '',
}

const CARGO: DeliveryProof = {
  createdAt: '2026-09-30T10:00:00Z',
  downloadUrl: 'https://storage.test/original/cargo',
  expiresAt: '2026-09-30T10:05:00Z',
  id: 'proof-cargo',
  kind: 'cargo',
  receiverName: '',
}

describe('applyCanhotoReviewResult (spec 220 T7.11)', () => {
  test('writes the verdict on the proof that already carries one, and only on it', () => {
    const [receipt, cargo] = applyCanhotoReviewResult([RECEIPT, CARGO], {
      canhotoReview: 'approved',
      canhotoReviewAt: '2026-09-30T12:00:00Z',
      canhotoReviewOrigin: 'manual',
    })

    expect(receipt?.canhotoReview).toBe('approved')
    expect(receipt?.canhotoReviewOrigin).toBe('manual')
    expect(receipt?.downloadUrl).toBe(RECEIPT.downloadUrl)
    expect(cargo).toEqual(CARGO)
  })

  test('drops the previous reviewer name and the reading the new view no longer carries', () => {
    const [receipt] = applyCanhotoReviewResult(
      [{ ...RECEIPT, canhotoReview: 'approved', canhotoReviewByName: 'Nome Sintético' }],
      { canhotoReview: 'rejected', canhotoReviewReason: 'illegible' },
    )

    expect(receipt?.canhotoReview).toBe('rejected')
    expect(receipt?.canhotoReviewReason).toBe('illegible')
    expect(receipt?.canhotoReviewByName).toBeUndefined()
    expect(receipt?.canhotoReadNumber).toBeUndefined()
    expect('canhotoReviewByName' in (receipt ?? {})).toBe(false)
  })

  test('not_applicable erases the verdict fields instead of publishing an invalid value', () => {
    const [receipt] = applyCanhotoReviewResult([RECEIPT], { canhotoReview: 'not_applicable' })

    expect(receipt).toEqual({
      createdAt: RECEIPT.createdAt,
      downloadUrl: RECEIPT.downloadUrl,
      expiresAt: RECEIPT.expiresAt,
      id: RECEIPT.id,
      kind: RECEIPT.kind,
      receiverName: '',
    })
  })
})
