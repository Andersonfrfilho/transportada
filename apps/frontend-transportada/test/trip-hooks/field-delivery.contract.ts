/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `useFieldDelivery` exercitado de verdade (`renderHook`, `act`) — ver `useFieldDelivery.hook.ts`
 * para o porquê da fila de envio (concorrência, `fieldDeliverySend.service.ts`) morar num serviço
 * puro à parte, já coberto sem DOM em `test/trip/field-delivery-send.contract.ts`. Aqui o que se
 * prova é o que só existe montado: a `Idempotency-Key` por nota sobrevivendo ao retry, o retry só
 * das falhas, o 409 virando `alreadySettled` e a invalidação no fim do lote (não por nota).
 */
import { describe, expect, test } from 'bun:test'

import type {
  ReportFieldDeliveryInput,
  ReportFieldDeliveryResult,
} from '@/modules/trip/shared/trip.types'
import type { FieldDeliveryDraft } from '@/modules/trip/shared/fieldDeliveryWizard.service'

import { renderHook, waitFor } from './renderHook.helper'

const { useFieldDelivery } = await import('@/modules/trip/hooks/useFieldDelivery.hook')

function draftFor(documentId: string): FieldDeliveryDraft {
  return { deliveredAt: '2026-09-18T12:00:00.000Z', documentId, imageBlob: new Blob() }
}

function settledResult(alreadySettled = false): ReportFieldDeliveryResult {
  return {
    alreadySettled,
    id: 'event-1',
    proofId: 'proof-1',
    stopCompleted: false,
    tripCompleted: false,
  }
}

describe('useFieldDelivery (spec 156 T12)', () => {
  test('gera uma Idempotency-Key por nota e a reusa no retry — nunca uma nova', async () => {
    const calls: ReportFieldDeliveryInput[] = []
    let failNext = true

    const rendered = await renderHook(() =>
      useFieldDelivery({
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: (input) => {
          calls.push(input)
          if (input.documentId === 'doc-2' && failNext) {
            failNext = false
            return Promise.reject(new Error('REQUEST_FAILED'))
          }
          return Promise.resolve(settledResult())
        },
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftFor('doc-1'), draftFor('doc-2')])
    await waitFor(() => expect(rendered.result().statusByDocumentId['doc-2']?.kind).toBe('failed'))

    rendered.result().retryFailed()
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-2']?.kind).toBe('delivered'),
    )

    const doc2Calls = calls.filter((call) => call.documentId === 'doc-2')
    expect(doc2Calls).toHaveLength(2)
    expect(doc2Calls[0]?.idempotencyKey).toBe(doc2Calls[1]?.idempotencyKey)

    rendered.unmount()
  })

  test('falha parcial não impede as outras notas, e retry só reenvia a que falhou', async () => {
    const sentDocumentIds: string[] = []

    const rendered = await renderHook(() =>
      useFieldDelivery({
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: (input) => {
          sentDocumentIds.push(input.documentId)
          if (input.documentId === 'doc-2')
            return Promise.reject(new Error('DELIVERED_AT_IN_FUTURE'))
          return Promise.resolve(settledResult())
        },
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftFor('doc-1'), draftFor('doc-2'), draftFor('doc-3')])
    await waitFor(() => {
      expect(rendered.result().statusByDocumentId['doc-1']?.kind).toBe('delivered')
      expect(rendered.result().statusByDocumentId['doc-2']?.kind).toBe('failed')
      expect(rendered.result().statusByDocumentId['doc-3']?.kind).toBe('delivered')
    })
    expect(rendered.result().isSubmitting).toBe(false)

    const sentBeforeRetry = sentDocumentIds.length
    rendered.result().retryFailed()
    await waitFor(() => expect(sentDocumentIds.length).toBe(sentBeforeRetry + 1))
    expect(sentDocumentIds.at(-1)).toBe('doc-2')

    rendered.unmount()
  })

  test('409 DOCUMENT_ALREADY_SETTLED vira alreadySettled, não uma falha vermelha (aceite 12)', async () => {
    const rendered = await renderHook(() =>
      useFieldDelivery({
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => Promise.resolve(settledResult(true)),
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftFor('doc-1')])
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({ kind: 'alreadySettled' }),
    )

    rendered.unmount()
  })

  test('invalida a viagem uma vez ao fim do lote, não a cada nota', async () => {
    let invalidateCalls = 0

    const rendered = await renderHook(() =>
      useFieldDelivery({
        invalidate: () => {
          invalidateCalls += 1
          return Promise.resolve()
        },
        reportFieldDelivery: () => Promise.resolve(settledResult()),
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftFor('doc-1'), draftFor('doc-2'), draftFor('doc-3')])
    /**
     * ⚠️ Esperar só `isSubmitting === false` é falso positivo: o valor **nasce** `false`, e o
     * primeiro `setIsSubmitting(true)` do `submit` ainda não foi commitado (fora de `act`) quando
     * este `waitFor` faz a primeira tentativa. Espera-se um estado terminal que não existe no
     * início (`statusByDocumentId` começa vazio) — aí sim o lote inteiro já terminou.
     */
    await waitFor(() => {
      expect(rendered.result().statusByDocumentId['doc-1']?.kind).toBe('delivered')
      expect(rendered.result().statusByDocumentId['doc-2']?.kind).toBe('delivered')
      expect(rendered.result().statusByDocumentId['doc-3']?.kind).toBe('delivered')
    })
    expect(rendered.result().isSubmitting).toBe(false)
    expect(invalidateCalls).toBe(1)

    rendered.unmount()
  })

  test('A4a: fechar (reset) durante o envio cancela o lote — resposta atrasada não reaparece', async () => {
    let releaseDoc1: (() => void) | undefined
    const seenSignals: AbortSignal[] = []

    const rendered = await renderHook(() =>
      useFieldDelivery({
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: (input) => {
          if (input.signal !== undefined) seenSignals.push(input.signal)
          if (input.documentId === 'doc-1') {
            return new Promise((resolve) => {
              releaseDoc1 = () => resolve(settledResult())
            })
          }
          return Promise.resolve(settledResult())
        },
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftFor('doc-1')])
    await waitFor(() => expect(rendered.result().statusByDocumentId['doc-1']?.kind).toBe('sending'))
    expect(seenSignals[0]?.aborted).toBe(false)

    rendered.result().reset()
    await waitFor(() => expect(Object.keys(rendered.result().statusByDocumentId)).toHaveLength(0))
    expect(seenSignals[0]?.aborted).toBe(true)

    /** A resposta do lote antigo chega depois do fechamento — não pode ressuscitar o status. */
    releaseDoc1?.()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(Object.keys(rendered.result().statusByDocumentId)).toHaveLength(0)
    expect(rendered.result().isSubmitting).toBe(false)

    rendered.unmount()
  })

  test('reset esquece o lote — próximo submit começa de status vazio', async () => {
    const rendered = await renderHook(() =>
      useFieldDelivery({
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => Promise.resolve(settledResult()),
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftFor('doc-1')])
    await waitFor(() => expect(rendered.result().statusByDocumentId['doc-1']).toBeDefined())

    rendered.result().reset()
    await waitFor(() => expect(Object.keys(rendered.result().statusByDocumentId)).toHaveLength(0))

    rendered.unmount()
  })
})
