/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T3 (CA04, D4, RF5): o alerta "parece ser da NF X" é derivado da leitura gravada na prova
 * contra a nota a que ela está anexada. Os cinco casos da D4, a escolha da nota citada (mesma viagem
 * vence, depois o mesmo emitente, depois a única; empate é `null`) e a publicação no comprovante
 * (só pendente, ausente nunca é `null`).
 */
import { describe, expect, test } from 'bun:test'

import {
  readDeliveryProofs,
  type DeliveryProofRecord,
} from '../../src/trips/application/read-delivery-proof.use-case.js'
import {
  compareCanhotoReading,
  normalizeCanhotoDigits,
  pickCanhotoMismatchDocument,
  readEmitterTaxIdFromAccessKey,
  type CanhotoMismatch,
  type CanhotoMismatchCandidate,
} from '../../src/trips/domain/canhoto-mismatch.policy.js'

const TRIP_ID = 'trip-atual'
const EXPECTED = { expectedNumber: '931988', expectedSeries: '1' } as const
const EMITTER = '12345678000199'

function candidate(overrides: Partial<CanhotoMismatchCandidate>): CanhotoMismatchCandidate {
  return {
    canhotoApproved: false,
    emitterTaxId: '99999999000100',
    nfeDocumentId: crypto.randomUUID(),
    number: '172195',
    series: '1',
    status: 'authorized',
    tripDocumentId: null,
    tripId: null,
    ...overrides,
  }
}

describe('os cinco casos da D4 (spec 344 CA04)', () => {
  test('1. número e série conferem: nenhum alerta', () => {
    expect(
      compareCanhotoReading({
        ...EXPECTED,
        readNumber: '931988',
        readSeries: '1',
        review: 'pending',
      }),
    ).toBeNull()
  })

  test('1b. número confere e a série não foi lida: nenhum alerta', () => {
    expect(
      compareCanhotoReading({
        ...EXPECTED,
        readNumber: '931988',
        readSeries: null,
        review: 'pending',
      }),
    ).toBeNull()
  })

  test('1c. zero à esquerda não é diferença', () => {
    expect(
      compareCanhotoReading({
        ...EXPECTED,
        readNumber: '000931988',
        readSeries: '001',
        review: 'pending',
      }),
    ).toBeNull()
  })

  test('2/3. número diferente: outra nota, com a leitura normalizada', () => {
    expect(
      compareCanhotoReading({
        ...EXPECTED,
        readNumber: '000172195',
        readSeries: '001',
        review: 'pending',
      }),
    ).toEqual({ kind: 'other_document', readNumber: '172195', readSeries: '1' })
  })

  test('2/3. número diferente sem série lida: alerta por número, série nula', () => {
    expect(
      compareCanhotoReading({
        ...EXPECTED,
        readNumber: '172195',
        readSeries: null,
        review: 'pending',
      }),
    ).toEqual({ kind: 'other_document', readNumber: '172195', readSeries: null })
  })

  test('4. mesmo número com série diferente: outra nota fiscal', () => {
    expect(
      compareCanhotoReading({
        ...EXPECTED,
        readNumber: '931988',
        readSeries: '2',
        review: 'pending',
      }),
    ).toEqual({ kind: 'other_series', readNumber: '931988', readSeries: '2' })
  })

  test('5. nada ancorado (sem número lido): comportamento de hoje, sem alerta', () => {
    for (const readNumber of [null, undefined, '']) {
      expect(
        compareCanhotoReading({ ...EXPECTED, readNumber, readSeries: null, review: 'pending' }),
      ).toBeNull()
    }
  })

  test('aprovada, recusada ou sem conferência: nunca alerta (RF5)', () => {
    for (const review of ['approved', 'rejected', 'not_applicable', undefined] as const) {
      expect(
        compareCanhotoReading({ ...EXPECTED, readNumber: '172195', readSeries: '1', review }),
      ).toBeNull()
    }
  })

  test('nota sem número esperado (vínculo sem NF-e): sem alerta', () => {
    expect(
      compareCanhotoReading({
        expectedNumber: null,
        expectedSeries: null,
        readNumber: '172195',
        readSeries: null,
        review: 'pending',
      }),
    ).toBeNull()
  })

  test('normalização: "000" é zero, não vazio', () => {
    expect(normalizeCanhotoDigits('000')).toBe('0')
    expect(normalizeCanhotoDigits(' 0172195 ')).toBe('172195')
  })
})

describe('qual nota citar (spec 344 D4)', () => {
  const divergence = { kind: 'other_document', readNumber: '172195', readSeries: '1' } as const

  test('a da mesma viagem vence a de outra viagem e a do mesmo emitente', () => {
    const sameTrip = candidate({ tripDocumentId: 'vinculo-b', tripId: TRIP_ID })
    const matched = pickCanhotoMismatchDocument({
      candidates: [
        candidate({ emitterTaxId: EMITTER, tripId: 'outra-viagem' }),
        sameTrip,
        candidate({ emitterTaxId: EMITTER }),
      ],
      currentTripId: TRIP_ID,
      divergence,
      expectedEmitterTaxId: EMITTER,
      expectedNfeDocumentId: 'nota-a',
    })

    expect(matched).toEqual({
      canhotoApproved: false,
      nfeDocumentId: sameTrip.nfeDocumentId,
      number: '172195',
      sameTrip: true,
      series: '1',
      status: 'authorized',
      tripDocumentId: 'vinculo-b',
      tripId: TRIP_ID,
    })
  })

  test('fora da viagem, o mesmo emitente da nota da prova desempata', () => {
    const sameEmitter = candidate({ emitterTaxId: EMITTER, tripId: 'outra-viagem' })
    const matched = pickCanhotoMismatchDocument({
      candidates: [candidate({}), sameEmitter],
      currentTripId: TRIP_ID,
      divergence,
      expectedEmitterTaxId: EMITTER,
      expectedNfeDocumentId: 'nota-a',
    })

    expect(matched?.nfeDocumentId).toBe(sameEmitter.nfeDocumentId)
    expect(matched?.sameTrip).toBe(false)
  })

  test('candidata única é citada, com o estado (cancelada aparece como cancelada)', () => {
    const only = candidate({ status: 'cancelled' })
    const matched = pickCanhotoMismatchDocument({
      candidates: [only],
      currentTripId: TRIP_ID,
      divergence,
      expectedEmitterTaxId: EMITTER,
      expectedNfeDocumentId: 'nota-a',
    })

    expect(matched?.status).toBe('cancelled')
    expect(matched?.tripId).toBeNull()
  })

  test('empate que sobra não cita ninguém ("parece ser de outra nota")', () => {
    expect(
      pickCanhotoMismatchDocument({
        candidates: [candidate({}), candidate({})],
        currentTripId: TRIP_ID,
        divergence,
        expectedEmitterTaxId: EMITTER,
        expectedNfeDocumentId: 'nota-a',
      }),
    ).toBeNull()
  })

  test('nota inexistente no sistema: sem candidata, sem citação', () => {
    expect(
      pickCanhotoMismatchDocument({
        candidates: [],
        currentTripId: TRIP_ID,
        divergence,
        expectedEmitterTaxId: EMITTER,
        expectedNfeDocumentId: 'nota-a',
      }),
    ).toBeNull()
  })

  test('série lida filtra: a 172195 série 2 não é a 172195 série 1', () => {
    expect(
      pickCanhotoMismatchDocument({
        candidates: [candidate({ series: '2', tripId: TRIP_ID })],
        currentTripId: TRIP_ID,
        divergence,
        expectedEmitterTaxId: EMITTER,
        expectedNfeDocumentId: 'nota-a',
      }),
    ).toBeNull()
  })

  test('série não lida: qualquer série do número serve', () => {
    const matched = pickCanhotoMismatchDocument({
      candidates: [candidate({ series: '2', tripId: TRIP_ID })],
      currentTripId: TRIP_ID,
      divergence: { ...divergence, readSeries: null },
      expectedEmitterTaxId: EMITTER,
      expectedNfeDocumentId: 'nota-a',
    })
    expect(matched?.series).toBe('2')
  })

  test('outra série do mesmo número nunca cita a própria nota da prova', () => {
    const own = candidate({ nfeDocumentId: 'nota-a', number: '931988', tripId: TRIP_ID })
    const otherSeries = candidate({ number: '931988', series: '2' })
    const matched = pickCanhotoMismatchDocument({
      candidates: [own, otherSeries],
      currentTripId: TRIP_ID,
      divergence: { kind: 'other_series', readNumber: '931988', readSeries: '2' },
      expectedEmitterTaxId: EMITTER,
      expectedNfeDocumentId: 'nota-a',
    })
    expect(matched?.nfeDocumentId).toBe(otherSeries.nfeDocumentId)
  })

  test('duplicidade da Q4 passa adiante: a NF X já tem canhoto aprovado', () => {
    const matched = pickCanhotoMismatchDocument({
      candidates: [candidate({ canhotoApproved: true, tripId: TRIP_ID })],
      currentTripId: TRIP_ID,
      divergence,
      expectedEmitterTaxId: EMITTER,
      expectedNfeDocumentId: 'nota-a',
    })
    expect(matched?.canhotoApproved).toBe(true)
  })

  test('o emitente sai das posições 7–20 da chave de acesso', () => {
    expect(readEmitterTaxIdFromAccessKey(`352611${EMITTER}550010001721951000000001`)).toBe(EMITTER)
  })
})

describe('o comprovante publica o alerta (spec 344 RF5)', () => {
  const BASE: DeliveryProofRecord = {
    bucket: 'transportada',
    createdAt: '2026-11-22T12:00:00.000Z',
    id: '00000000-0000-4000-8000-0000000000a1',
    kind: 'photo',
    lateRegistration: false,
    mimeType: 'image/jpeg',
    objectKey: 'companies/1/proofs/a1.jpg',
    receiverDocumentMasked: '',
    receiverName: 'Maria',
    receivedBy: null,
    receivedByDetail: null,
  }
  const MISMATCH: CanhotoMismatch = {
    kind: 'other_document',
    matchedDocument: null,
    readNumber: '172195',
    readSeries: '1',
  }

  async function publish(record: DeliveryProofRecord): Promise<Record<string, unknown>> {
    const [view] = await readDeliveryProofs({
      companyId: 'company',
      documentId: 'document',
      downloads: {
        createDownloadUrl: async () => ({ expiresAt: BASE.createdAt, url: 'https://signed' }),
      },
      repository: { listDeliveryProofs: async () => [record] },
      tripId: 'trip',
    })
    return { ...view }
  }

  test('pendente com divergência leva canhotoMismatch', async () => {
    const view = await publish({
      ...BASE,
      canhotoMismatch: MISMATCH,
      canhotoReadNumber: '172195',
      canhotoReadSeries: '1',
      canhotoReadSource: 'ocr',
      canhotoReview: 'pending',
    })
    expect(view.canhotoMismatch).toEqual(MISMATCH)
  })

  test('sem divergência a chave some (nunca null)', async () => {
    const view = await publish({ ...BASE, canhotoMismatch: null, canhotoReview: 'pending' })
    expect('canhotoMismatch' in view).toBe(false)
  })

  test('aprovada não publica o alerta nem se a leitura derivada vier', async () => {
    const view = await publish({
      ...BASE,
      canhotoMismatch: MISMATCH,
      canhotoReadNumber: '172195',
      canhotoReadSource: 'barcode',
      canhotoReview: 'approved',
      canhotoReviewAt: '2026-11-22T13:00:00.000Z',
      canhotoReviewOrigin: 'automatic',
    })
    expect('canhotoMismatch' in view).toBe(false)
  })
})
