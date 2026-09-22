/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  isRetryableFieldDeliveryFailure,
  isRetryableFieldDeliveryStatus,
  runFieldDeliverySendBatch,
  type FieldDeliverySendOutcome,
} from '../../src/modules/trip/shared/fieldDeliverySend.service'
import type { FieldDeliveryDraft } from '../../src/modules/trip/shared/fieldDeliveryWizard.service'
import { readTripRequestErrorStatus } from '../../src/modules/trip/shared/tripClient.service'

function draftFor(documentId: string): FieldDeliveryDraft {
  return { deliveredAt: '2026-09-18T12:00:00.000Z', documentId, imageBlob: new Blob() }
}

/**
 * Spec 156 T12 (aceites 5, 7): a fila de envio é pura — nenhuma rede, nenhum React. `send` nunca
 * lança (quem chama já converteu qualquer rejeição em `{ kind: 'failed' }`), então o que se testa
 * aqui é só a orquestração: concorrência, ordem de conclusão e "uma falha não trava o resto".
 */
describe('fila de envio da baixa em massa (spec 156 T12)', () => {
  it('nunca roda mais que a concorrência pedida ao mesmo tempo', async () => {
    const documentIds = ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']
    let active = 0
    let peakActive = 0
    const started: string[] = []

    await runFieldDeliverySendBatch({
      concurrency: 3,
      drafts: documentIds.map(draftFor),
      onSettle: () => undefined,
      onStart: (documentId) => started.push(documentId),
      send: async () => {
        active += 1
        peakActive = Math.max(peakActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return { kind: 'delivered' }
      },
    })

    expect(peakActive).toBeLessThanOrEqual(3)
    expect(started.toSorted()).toEqual(documentIds.toSorted())
  })

  it('envia tudo mesmo com menos notas que a concorrência', async () => {
    const settled: string[] = []
    await runFieldDeliverySendBatch({
      concurrency: 3,
      drafts: [draftFor('doc-1')],
      onSettle: (documentId) => settled.push(documentId),
      onStart: () => undefined,
      send: () => Promise.resolve({ kind: 'delivered' }),
    })
    expect(settled).toEqual(['doc-1'])
  })

  it('uma falha não interrompe o envio das outras (aceite 7)', async () => {
    const outcomeByDocumentId: Record<string, FieldDeliverySendOutcome> = {}

    await runFieldDeliverySendBatch({
      concurrency: 3,
      drafts: ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5'].map(draftFor),
      onSettle: (documentId, outcome) => {
        outcomeByDocumentId[documentId] = outcome
      },
      onStart: () => undefined,
      send: (draft) =>
        Promise.resolve(
          draft.documentId === 'doc-3'
            ? { code: 'REQUEST_FAILED', kind: 'failed' as const, retryable: true }
            : { kind: 'delivered' as const },
        ),
    })

    expect(Object.keys(outcomeByDocumentId)).toHaveLength(5)
    expect(outcomeByDocumentId['doc-3']).toEqual({
      code: 'REQUEST_FAILED',
      kind: 'failed',
      retryable: true,
    })
    expect(outcomeByDocumentId['doc-1']).toEqual({ kind: 'delivered' })
    expect(outcomeByDocumentId['doc-5']).toEqual({ kind: 'delivered' })
  })

  it('lote vazio não chama `send`', async () => {
    let calls = 0
    await runFieldDeliverySendBatch({
      drafts: [],
      onSettle: () => undefined,
      onStart: () => undefined,
      send: () => {
        calls += 1
        return Promise.resolve({ kind: 'delivered' })
      },
    })
    expect(calls).toBe(0)
  })
})

/**
 * M13a (spec 156 T15): a falha só é reenviável quando é transitória — rede (sem status), 429 e
 * 5xx. 400/422 é recusa terminal do corpo enviado.
 */
describe('isRetryableFieldDeliveryStatus (spec 156 T15, M13a)', () => {
  it('sem status (falha de rede) é reenviável', () => {
    expect(isRetryableFieldDeliveryStatus(undefined)).toBe(true)
  })

  it('429 (rate limit) é reenviável', () => {
    expect(isRetryableFieldDeliveryStatus(429)).toBe(true)
  })

  it('5xx é reenviável', () => {
    expect(isRetryableFieldDeliveryStatus(500)).toBe(true)
    expect(isRetryableFieldDeliveryStatus(503)).toBe(true)
  })

  it('400 e 422 não são reenviáveis — recusa terminal do corpo enviado', () => {
    expect(isRetryableFieldDeliveryStatus(400)).toBe(false)
    expect(isRetryableFieldDeliveryStatus(422)).toBe(false)
  })
})

describe('isRetryableFieldDeliveryFailure (spec 156 T15, correção pós-API)', () => {
  it('TRIP_STATUS_WRITE_CONFLICT (409) é reenviável, mesmo sendo 409', () => {
    expect(
      isRetryableFieldDeliveryFailure({ code: 'TRIP_STATUS_WRITE_CONFLICT', status: 409 }),
    ).toBe(true)
  })

  it('outro 409 (ex.: TRIP_DELIVERY_PROOF_ALREADY_CAPTURED) continua terminal', () => {
    expect(
      isRetryableFieldDeliveryFailure({
        code: 'TRIP_DELIVERY_PROOF_ALREADY_CAPTURED',
        status: 409,
      }),
    ).toBe(false)
  })

  it('sem o código especial, segue a régua de status de sempre', () => {
    expect(isRetryableFieldDeliveryFailure({ code: 'DELIVERED_AT_IN_FUTURE', status: 400 })).toBe(
      false,
    )
    expect(
      isRetryableFieldDeliveryFailure({ code: 'TRIP_REQUEST_FAILED', status: undefined }),
    ).toBe(true)
  })
})

describe('readTripRequestErrorStatus (spec 156 T15, M13a)', () => {
  it('lê o status de um erro do cliente da viagem', () => {
    const error = Object.assign(new Error('DELIVERED_AT_IN_FUTURE'), { status: 400 })
    expect(readTripRequestErrorStatus(error)).toBe(400)
  })

  it('erro sem status (rede, ou erro de outra origem) devolve undefined', () => {
    expect(readTripRequestErrorStatus(new Error('REQUEST_FAILED'))).toBeUndefined()
    expect(readTripRequestErrorStatus('not-an-error')).toBeUndefined()
  })
})
