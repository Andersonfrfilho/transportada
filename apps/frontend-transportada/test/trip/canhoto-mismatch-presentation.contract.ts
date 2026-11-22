/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5 (D8, RF6): do alerta da API ao que a tela diz, e quem fica fora do "aprovar todos".
 * O alerta só vale no canhoto pendente; o texto reconhecido nunca chega aqui (só número e série).
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import type { CanhotoMismatch } from '@/modules/trip/shared/canhotoMismatch.validation'
import {
  isCanhotoFlagged,
  presentCanhotoMismatch,
} from '@/modules/trip/shared/canhotoMismatchPresentation.service'
import type { DeliveryProof } from '@/modules/trip/shared/deliveryProof.service'

const MATCHED = {
  canhotoApproved: false,
  nfeDocumentId: 'nfe-172195',
  number: '172195',
  sameTrip: true,
  series: '1',
  status: 'authorized' as const,
  tripDocumentId: 'vinculo-172195',
  tripId: 'viagem-1',
}

const MISMATCH: CanhotoMismatch = {
  kind: 'other_document',
  matchedDocument: MATCHED,
  readNumber: '172195',
  readSeries: '1',
}

const PROOF: DeliveryProof = {
  canhotoMismatch: MISMATCH,
  canhotoReview: 'pending',
  createdAt: '2026-11-22T12:01:00.000Z',
  downloadUrl: 'https://bucket.example/p1.jpg',
  expiresAt: '2026-11-22T12:06:00.000Z',
  id: 'p1',
  kind: 'photo',
  receiverName: 'Maria',
}

describe('presentCanhotoMismatch (spec 344 T5)', () => {
  it('nota achada na mesma viagem: "parece ser da NF X (série S)" e a viagem', () => {
    expect(presentCanhotoMismatch(MISMATCH)).toEqual({
      details: ['sameTrip'],
      headlineKey: 'matched',
      number: '172195',
      series: '1',
    })
  })

  it('nota de outra viagem, cancelada e já com canhoto aprovado: cada fato vira uma linha', () => {
    const presentation = presentCanhotoMismatch({
      ...MISMATCH,
      matchedDocument: { ...MATCHED, canhotoApproved: true, sameTrip: false, status: 'cancelled' },
    })
    expect(presentation.details).toEqual(['otherTrip', 'statusCancelled', 'alreadyApproved'])
  })

  it('nota que não está no sistema: "outra nota" com o número lido, e a série só se foi lida', () => {
    const withSeries = presentCanhotoMismatch({ ...MISMATCH, matchedDocument: null })
    expect(withSeries).toEqual({
      details: [],
      headlineKey: 'unknownWithSeries',
      number: '172195',
      series: '1',
    })
    const withoutSeries = presentCanhotoMismatch({
      ...MISMATCH,
      matchedDocument: null,
      readSeries: null,
    })
    expect(withoutSeries.headlineKey).toBe('unknownWithoutSeries')
  })
})

describe('isCanhotoFlagged (spec 344 D8.2)', () => {
  it('canhoto pendente com alerta é sinalizado: fica fora do "aprovar todos"', () => {
    expect(isCanhotoFlagged(PROOF)).toBe(true)
  })

  it('sem alerta, aprovado ou recusado não é sinalizado', () => {
    const { canhotoMismatch, ...withoutAlert } = PROOF
    void canhotoMismatch
    expect(isCanhotoFlagged(withoutAlert)).toBe(false)
    expect(isCanhotoFlagged({ ...PROOF, canhotoReview: 'approved' })).toBe(false)
    expect(isCanhotoFlagged({ ...PROOF, canhotoReview: 'rejected' })).toBe(false)
  })
})

describe('locale do alerta (spec 344 T5)', () => {
  const read = (file: string): Record<string, unknown> =>
    JSON.parse(readFileSync(`src/modules/trip/locales/${file}`, 'utf8')) as Record<string, unknown>

  it('toda chave que a faixa e o maço usam existe em pt-BR e em en', () => {
    const detail = [
      'alreadyApproved',
      'otherTrip',
      'sameTrip',
      'statusCancelled',
      'statusDenied',
      'statusUnsigned',
    ]
    for (const file of ['trip.locale.json', 'trip.en.locale.json']) {
      const proof = read(file).deliveryProof as Record<string, Record<string, unknown>>
      const mismatch = proof.canhotoMismatch as Record<string, unknown>
      for (const key of ['matched', 'unknownWithSeries', 'unknownWithoutSeries']) {
        expect(typeof mismatch[key]).toBe('string')
      }
      for (const key of detail) {
        expect(typeof (mismatch.detail as Record<string, unknown>)[key]).toBe('string')
      }
      expect(typeof proof.canhotoReview?.approveAnyway).toBe('string')
      expect(typeof proof.canhotoBatch?.flaggedHint).toBe('string')
    }
  })
})
