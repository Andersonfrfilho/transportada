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
  AttachFieldProofInput,
  ReportFieldDeliveryInput,
  ReportFieldDeliveryResult,
} from '@/modules/trip/shared/trip.types'
import type { FieldDeliveryDraft } from '@/modules/trip/shared/fieldDeliveryWizard.service'

import { renderHook, waitFor } from './renderHook.helper'

const { useFieldDelivery } = await import('@/modules/trip/hooks/useFieldDelivery.hook')

function draftFor(documentId: string): FieldDeliveryDraft {
  return { cargoImageBlobs: [], deliveredAt: '2026-09-18T12:00:00.000Z', documentId, imageBlob: new Blob() }
}

function draftWithCargo(documentId: string, cargoPhotoCount: number): FieldDeliveryDraft {
  return {
    ...draftFor(documentId),
    cargoImageBlobs: Array.from({ length: cargoPhotoCount }, () => new Blob()),
  }
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
        attachFieldProof: () => Promise.resolve({ id: 'proof-cargo' }),
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
        attachFieldProof: () => Promise.resolve({ id: 'proof-cargo' }),
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
        attachFieldProof: () => Promise.resolve({ id: 'proof-cargo' }),
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
        attachFieldProof: () => Promise.resolve({ id: 'proof-cargo' }),
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
        attachFieldProof: () => Promise.resolve({ id: 'proof-cargo' }),
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
        attachFieldProof: () => Promise.resolve({ id: 'proof-cargo' }),
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

/**
 * Spec 182 D5 (T3.1): a foto de carga sobe depois da baixa, uma de cada vez, em `field-proof`
 * (`kind: 'cargo'`) — nunca antes, nunca em paralelo, e uma foto que falha não desfaz a baixa.
 */
describe('useFieldDelivery — fotos da carga (spec 182 D5)', () => {
  test('duas fotos de carga: baixa a nota e depois chama attachFieldProof duas vezes, em ordem — nunca em paralelo', async () => {
    const cargoCalls: AttachFieldProofInput[] = []
    let releaseFirstCargoUpload: (() => void) | undefined
    let deliveryCalled = false

    const rendered = await renderHook(() =>
      useFieldDelivery({
        attachFieldProof: (input) => {
          cargoCalls.push(input)
          if (cargoCalls.length === 1) {
            return new Promise((resolve) => {
              releaseFirstCargoUpload = () => resolve({ id: 'cargo-1' })
            })
          }
          return Promise.resolve({ id: 'cargo-2' })
        },
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => {
          deliveryCalled = true
          return Promise.resolve(settledResult())
        },
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftWithCargo('doc-1', 2)])
    await waitFor(() => expect(cargoCalls).toHaveLength(1))
    expect(deliveryCalled).toBe(true)

    // A segunda foto não é chamada enquanto a primeira ainda está em voo — prova de "em sequência,
    // não em paralelo": se fosse paralelo as duas chamadas já teriam disparado juntas acima.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(cargoCalls).toHaveLength(1)

    releaseFirstCargoUpload?.()
    await waitFor(() => expect(cargoCalls).toHaveLength(2))
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({ kind: 'delivered' }),
    )

    expect(cargoCalls.every((call) => call.kind === 'cargo')).toBe(true)
    expect(cargoCalls.every((call) => call.documentId === 'doc-1')).toBe(true)

    rendered.unmount()
  })

  test('falha numa foto de carga não desfaz a baixa — nota fica delivered com cargoPending', async () => {
    let cargoAttempts = 0

    const rendered = await renderHook(() =>
      useFieldDelivery({
        attachFieldProof: () => {
          cargoAttempts += 1
          return Promise.reject(new Error('OFFICE_UPLOAD_FAILED'))
        },
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => Promise.resolve(settledResult()),
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftWithCargo('doc-1', 1)])
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({
        cargoPending: 1,
        kind: 'delivered',
      }),
    )
    expect(cargoAttempts).toBe(1)

    rendered.unmount()
  })

  test('retryFailed reenvia a foto de carga pendente com a mesma Idempotency-Key', async () => {
    const cargoCalls: AttachFieldProofInput[] = []
    let failFirstCargoUpload = true

    const rendered = await renderHook(() =>
      useFieldDelivery({
        attachFieldProof: (input) => {
          cargoCalls.push(input)
          if (failFirstCargoUpload) {
            failFirstCargoUpload = false
            return Promise.reject(new Error('OFFICE_UPLOAD_FAILED'))
          }
          return Promise.resolve({ id: 'cargo-1' })
        },
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => Promise.resolve(settledResult()),
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftWithCargo('doc-1', 1)])
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({
        cargoPending: 1,
        kind: 'delivered',
      }),
    )

    rendered.result().retryFailed()
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({ kind: 'delivered' }),
    )

    expect(cargoCalls).toHaveLength(2)
    expect(cargoCalls[0]?.idempotencyKey).toBe(cargoCalls[1]?.idempotencyKey)

    rendered.unmount()
  })

  test('M13a espelhado na foto de carga: 422 vira cargoRejected — terminal, fora do retry, e o retry não chama attachFieldProof de novo para ela', async () => {
    const cargoCalls: AttachFieldProofInput[] = []
    let reportFieldDeliveryCalls = 0

    const rendered = await renderHook(() =>
      useFieldDelivery({
        attachFieldProof: (input) => {
          cargoCalls.push(input)
          return Promise.reject(
            Object.assign(new Error('TRIP_DELIVERY_PROOF_CARGO_LIMIT'), { status: 422 }),
          )
        },
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => {
          reportFieldDeliveryCalls += 1
          return Promise.resolve(settledResult())
        },
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftWithCargo('doc-1', 1)])
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({
        cargoRejected: 1,
        kind: 'delivered',
      }),
    )
    expect(cargoCalls).toHaveLength(1)
    expect(reportFieldDeliveryCalls).toBe(1)

    // Recusa terminal não entra no "tentar de novo": nem attachFieldProof nem reportFieldDelivery
    // são chamados outra vez.
    rendered.result().retryFailed()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(cargoCalls).toHaveLength(1)
    expect(reportFieldDeliveryCalls).toBe(1)
    expect(rendered.result().statusByDocumentId['doc-1']).toEqual({
      cargoRejected: 1,
      kind: 'delivered',
    })

    rendered.unmount()
  })

  test('erro transitório na foto de carga vira cargoPending, e o retry reenvia só a foto — sem chamar reportFieldDelivery de novo', async () => {
    const cargoCalls: AttachFieldProofInput[] = []
    let failFirstCargoUpload = true
    let reportFieldDeliveryCalls = 0

    const rendered = await renderHook(() =>
      useFieldDelivery({
        attachFieldProof: (input) => {
          cargoCalls.push(input)
          if (failFirstCargoUpload) {
            failFirstCargoUpload = false
            return Promise.reject(new Error('REQUEST_FAILED'))
          }
          return Promise.resolve({ id: 'cargo-1' })
        },
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => {
          reportFieldDeliveryCalls += 1
          return Promise.resolve(settledResult())
        },
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftWithCargo('doc-1', 1)])
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({
        cargoPending: 1,
        kind: 'delivered',
      }),
    )
    expect(reportFieldDeliveryCalls).toBe(1)

    rendered.result().retryFailed()
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({ kind: 'delivered' }),
    )

    expect(cargoCalls).toHaveLength(2)
    expect(cargoCalls[0]?.idempotencyKey).toBe(cargoCalls[1]?.idempotencyKey)
    // A nota já estava `delivered` — o retry de foto de carga nunca repete a baixa.
    expect(reportFieldDeliveryCalls).toBe(1)

    rendered.unmount()
  })

  test('mistura: uma foto recusada (terminal) e outra pendente (transitória) — só a pendente entra no retry', async () => {
    const cargoCalls: AttachFieldProofInput[] = []
    let callCount = 0

    const rendered = await renderHook(() =>
      useFieldDelivery({
        attachFieldProof: (input) => {
          cargoCalls.push(input)
          callCount += 1
          // sendCargoPhotos nunca roda em paralelo (D5): a 1ª chamada é sempre a foto 0 (recusa
          // terminal), a 2ª é sempre a foto 1 (falha transitória) e a 3ª (só existe no retry) é a
          // foto 1 de novo.
          if (callCount === 1) {
            return Promise.reject(
              Object.assign(new Error('TRIP_DELIVERY_PROOF_CARGO_LIMIT'), { status: 422 }),
            )
          }
          if (callCount === 2) return Promise.reject(new Error('REQUEST_FAILED'))
          return Promise.resolve({ id: 'cargo-ok' })
        },
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => Promise.resolve(settledResult()),
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftWithCargo('doc-1', 2)])
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({
        cargoPending: 1,
        cargoRejected: 1,
        kind: 'delivered',
      }),
    )

    rendered.result().retryFailed()
    await waitFor(() =>
      expect(rendered.result().statusByDocumentId['doc-1']).toEqual({
        cargoRejected: 1,
        kind: 'delivered',
      }),
    )
    // A foto recusada nunca volta a ser tentada — só a pendente reentrou no retry.
    expect(cargoCalls).toHaveLength(3)

    rendered.unmount()
  })

  test('nota sem foto de carga nunca chama attachFieldProof', async () => {
    let cargoCallCount = 0

    const rendered = await renderHook(() =>
      useFieldDelivery({
        attachFieldProof: () => {
          cargoCallCount += 1
          return Promise.resolve({ id: 'cargo-1' })
        },
        invalidate: () => Promise.resolve(),
        reportFieldDelivery: () => Promise.resolve(settledResult()),
        tripId: 'trip-1',
      }),
    )

    rendered.result().submit([draftFor('doc-1')])
    await waitFor(() => expect(rendered.result().statusByDocumentId['doc-1']?.kind).toBe('delivered'))

    expect(cargoCallCount).toBe(0)
    expect(rendered.result().statusByDocumentId['doc-1']).toEqual({ kind: 'delivered' })

    rendered.unmount()
  })
})
