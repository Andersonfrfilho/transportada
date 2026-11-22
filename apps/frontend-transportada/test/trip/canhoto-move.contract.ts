/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5c (D9, RF10/RF11): o "Mover para a NF X" do painel. O contrato da rota é o da T5b: corpo
 * estrito `{ targetDocumentId, reason }`, sem `companyId`, e resposta lida com guarda. O botão só
 * existe para nota da mesma viagem, sem canhoto aprovado e com vínculo vivo.
 */
import { describe, expect, test } from 'bun:test'

import {
  canhotoMoveBody,
  canhotoMoveResultFromApi,
  CANHOTO_MOVE_ERROR_KEYS,
  CANHOTO_MOVE_REASONS,
  resolveCanhotoMoveTarget,
} from '../../src/modules/trip/shared/canhotoMove.service'
import type { CanhotoMismatch } from '../../src/modules/trip/shared/canhotoMismatch.validation'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'
import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'

import { DOCUMENT_ID, SYNTHETIC_ACCESS_TOKEN, TRIP_ID } from './trip.fixture'

const API_URL = 'https://api.example.test'
const TARGET_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000aa'

const MATCHED = {
  canhotoApproved: false,
  nfeDocumentId: 'nfe-172195',
  number: '172195',
  sameTrip: true,
  series: '1',
  status: 'authorized' as const,
  tripDocumentId: TARGET_DOCUMENT_ID,
  tripId: TRIP_ID,
}

function proofWith(
  mismatch: CanhotoMismatch | undefined,
  review: 'approved' | 'pending' = 'pending',
): DeliveryProof {
  return {
    canhotoReview: review,
    createdAt: '2026-11-22T12:01:00.000Z',
    downloadUrl: 'https://bucket.example/p1.jpg',
    expiresAt: '2026-11-22T12:06:00.000Z',
    id: 'p1',
    kind: 'photo',
    receiverName: 'Maria',
    ...(mismatch === undefined ? {} : { canhotoMismatch: mismatch }),
  }
}

function mismatchWith(
  matched:
    | (Partial<Omit<typeof MATCHED, 'tripDocumentId'>> & { tripDocumentId?: null | string })
    | null,
): CanhotoMismatch {
  return {
    kind: 'other_document',
    matchedDocument: matched === null ? null : { ...MATCHED, ...matched },
    readNumber: '172195',
    readSeries: '1',
  }
}

describe('resolveCanhotoMoveTarget (spec 344 D9)', () => {
  test('nota da mesma viagem, sem canhoto aprovado e com vínculo: o botão existe', () => {
    expect(resolveCanhotoMoveTarget(proofWith(mismatchWith({})))).toEqual({
      number: '172195',
      series: '1',
      targetDocumentId: TARGET_DOCUMENT_ID,
    })
  })

  test.each([
    ['nota de outra viagem', mismatchWith({ sameTrip: false })],
    ['nota que já tem canhoto aprovado', mismatchWith({ canhotoApproved: true })],
    ['nota sem vínculo vivo', mismatchWith({ tripDocumentId: null })],
    ['nota que não está no sistema', mismatchWith(null)],
  ])('%s: sem botão, só o alerta', (_name, mismatch) => {
    expect(resolveCanhotoMoveTarget(proofWith(mismatch))).toBeUndefined()
  })

  test('sem alerta ou com o canhoto já aprovado: sem botão', () => {
    expect(resolveCanhotoMoveTarget(proofWith(undefined))).toBeUndefined()
    expect(resolveCanhotoMoveTarget(proofWith(mismatchWith({}), 'approved'))).toBeUndefined()
  })
})

describe('contrato da rota proof/move (spec 344 T5b)', () => {
  test('o corpo leva só o destino e o motivo da lista fechada', () => {
    expect(CANHOTO_MOVE_REASONS).toEqual(['wrong_document', 'driver_mistake', 'office_mistake'])
    expect(
      canhotoMoveBody({
        documentId: DOCUMENT_ID,
        reason: 'wrong_document',
        targetDocumentId: TARGET_DOCUMENT_ID,
        tripId: TRIP_ID,
      }),
    ).toEqual({ reason: 'wrong_document', targetDocumentId: TARGET_DOCUMENT_ID })
  })

  test('POST na rota da nota de origem, sem chave de idempotência, e lê a resposta', async () => {
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: API_URL,
      fetch: (input, init) => {
        requests.push(new Request(input, init))
        return Promise.resolve(
          Response.json({
            data: {
              alreadyMoved: false,
              review: 'pending',
              sourceDocumentId: DOCUMENT_ID,
              targetDocumentId: TARGET_DOCUMENT_ID,
            },
          }),
        )
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const result = await client.canhotoMoveProof({
      documentId: DOCUMENT_ID,
      reason: 'office_mistake',
      targetDocumentId: TARGET_DOCUMENT_ID,
      tripId: TRIP_ID,
    })

    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(`${API_URL}/trips/${TRIP_ID}/documents/${DOCUMENT_ID}/proof/move`)
    expect(await request?.json()).toEqual({
      reason: 'office_mistake',
      targetDocumentId: TARGET_DOCUMENT_ID,
    })
    expect(result).toEqual({
      alreadyMoved: false,
      review: 'pending',
      sourceDocumentId: DOCUMENT_ID,
      targetDocumentId: TARGET_DOCUMENT_ID,
    })
  })

  test('resposta fora do formato é recusada; os 409 conhecidos têm frase própria', () => {
    expect(() => canhotoMoveResultFromApi({ alreadyMoved: 'sim' })).toThrow()
    expect(CANHOTO_MOVE_ERROR_KEYS.CANHOTO_MOVE_TARGET_HAS_PROOF).toBe('targetHasProof')
    expect(CANHOTO_MOVE_ERROR_KEYS.CANHOTO_MOVE_TARGET_NOT_DELIVERED).toBe('targetNotDelivered')
  })
})
