/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import {
  isRetryableFieldDeliveryFailure,
  runFieldDeliverySendBatch,
  type FieldDeliverySendOutcome,
  type FieldDeliverySendStatus,
} from '../shared/fieldDeliverySend.service'
import type { FieldDeliveryDraft } from '../shared/fieldDeliveryWizard.service'
import { readTripRequestErrorStatus } from '../shared/tripClient.service'
import type {
  AttachFieldProofInput,
  FieldReportIdResult,
  ReportFieldDeliveryInput,
  ReportFieldDeliveryResult,
} from '../shared/trip.types'

export type { FieldDeliverySendStatus } from '../shared/fieldDeliverySend.service'

export type UseFieldDeliveryInput = Readonly<{
  /** Spec 182 D5: sobe depois da baixa da nota, uma foto de carga por vez, nunca em paralelo. */
  attachFieldProof: (input: AttachFieldProofInput) => Promise<FieldReportIdResult>
  /** Chamada ao fim do lote inteiro (não a cada nota) — detalhe, allowed-actions, ocorrências. */
  invalidate: () => Promise<void>
  reportFieldDelivery: (input: ReportFieldDeliveryInput) => Promise<ReportFieldDeliveryResult>
  tripId: string
}>

export type FieldDeliveryController = Readonly<{
  isSubmitting: boolean
  /** Esquece o lote inteiro — chamado ao fechar o assistente, para a próxima abertura sair limpa. */
  reset: () => void
  /** Reenvia só as notas com `status.kind === 'failed'`, com a mesma `Idempotency-Key` de cada. */
  retryFailed: () => void
  statusByDocumentId: Readonly<Record<string, FieldDeliverySendStatus>>
  submit: (drafts: readonly FieldDeliveryDraft[]) => void
}>

/**
 * Spec 156 T12 (D5, D9; aceites 5, 7, 12): envia o `FieldDeliveryDraft[]` do assistente (T11) nota
 * a nota, concorrência 3 (`fieldDeliverySend.service.ts`, pura e testada sem DOM), cada uma com a
 * própria `Idempotency-Key` — gerada uma vez por nota e reusada em qualquer retentativa dela,
 * nunca uma chave nova (D3, mesmo padrão de `resolveFieldReportKey` em `useTripWorkspace`). Falha
 * de uma nota não interrompe as outras, e o 409 `DOCUMENT_ALREADY_SETTLED` vira `alreadySettled`
 * — informativo, não um erro vermelho (aceite 12).
 */
export function useFieldDelivery(input: UseFieldDeliveryInput): FieldDeliveryController {
  const [statusByDocumentId, setStatusByDocumentId] = useState<
    Readonly<Record<string, FieldDeliverySendStatus>>
  >({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const draftsRef = useRef<Record<string, FieldDeliveryDraft>>({})
  const idempotencyKeysRef = useRef<Record<string, string>>({})
  /**
   * Spec 182 D5: uma chave por `(documentId, índice da foto)` — estável entre tentativas, mesmo
   * padrão de `idempotencyKeysRef` acima. Reenviar (retry) nunca gera chave nova para a mesma foto.
   */
  const cargoIdempotencyKeysRef = useRef<Record<string, string>>({})
  /**
   * Achado de revisão (spec 182): status por foto de carga (`documentId` → índice → resultado),
   * o que permite ao retry reenviar só a que ainda está `pending` — nunca a `rejected` (terminal) e
   * nunca a `sent` de novo (idempotência por índice, mesma chave de `cargoIdempotencyKeysRef`).
   */
  const cargoPhotoOutcomesRef = useRef<Record<string, ('pending' | 'rejected' | 'sent')[]>>({})
  /**
   * Achado de revisão (spec 182): nota cuja baixa (`reportFieldDelivery`) já foi confirmada
   * (`delivered`/`alreadySettled`) — o retry dela nunca chama `reportFieldDelivery` de novo, só
   * reenvia as fotos de carga que ainda faltam.
   */
  const deliveryResultRef = useRef<Record<string, 'alreadySettled' | 'delivered'>>({})
  /**
   * A4a (spec 156 T15): fechar o assistente no meio do envio não pode deixar o lote antigo
   * terminando por trás — as chamadas em voo são canceladas (`AbortController`) e qualquer
   * `onStart`/`onSettle` que ainda chegue depois do cancelamento é ignorado, para o próximo
   * assistente (que reusa o mesmo hook) começar limpo em vez de herdar status de um lote morto.
   */
  const abortControllerRef = useRef<AbortController | undefined>(undefined)

  function resolveIdempotencyKey(documentId: string): string {
    const existing = idempotencyKeysRef.current[documentId]
    if (existing !== undefined) return existing
    const key = crypto.randomUUID()
    idempotencyKeysRef.current[documentId] = key
    return key
  }

  function resolveCargoIdempotencyKey(documentId: string, photoIndex: number): string {
    const cacheKey = `${documentId}:${String(photoIndex)}`
    const existing = cargoIdempotencyKeysRef.current[cacheKey]
    if (existing !== undefined) return existing
    const key = crypto.randomUUID()
    cargoIdempotencyKeysRef.current[cacheKey] = key
    return key
  }

  /**
   * Spec 182 D5 (achado de revisão): sobe uma foto de carga de cada vez, em ordem — nunca em
   * paralelo, e só depois que a baixa da nota já foi confirmada. Cada foto é classificada pelo
   * mesmo critério M13a da nota (`isRetryableFieldDeliveryFailure`): falha transitória vira
   * `pending` (o retry reenvia), falha terminal (400/422) vira `rejected` (nunca reenviada). O
   * status por foto fica em `cargoPhotoOutcomesRef` — chamado de novo (retry), esta função só
   * tenta de novo o que ainda está `pending`, pulando `sent`/`rejected`.
   */
  async function sendCargoPhotos(
    draft: FieldDeliveryDraft,
    signal: AbortSignal,
  ): Promise<Readonly<{ cargoPending: number; cargoRejected: number }>> {
    const outcomes = [...(cargoPhotoOutcomesRef.current[draft.documentId] ?? [])]
    for (let photoIndex = 0; photoIndex < draft.cargoImageBlobs.length; photoIndex += 1) {
      const imageBlob = draft.cargoImageBlobs[photoIndex]
      if (imageBlob === undefined) continue
      const previousOutcome = outcomes[photoIndex]
      if (previousOutcome === 'sent' || previousOutcome === 'rejected') continue
      try {
        await input.attachFieldProof({
          documentId: draft.documentId,
          idempotencyKey: resolveCargoIdempotencyKey(draft.documentId, photoIndex),
          imageBlob,
          kind: 'cargo',
          signal,
          tripId: input.tripId,
          ...(draft.driverId === undefined ? {} : { driverId: draft.driverId }),
        })
        outcomes[photoIndex] = 'sent'
      } catch (error) {
        const code = error instanceof Error ? error.message : 'REQUEST_FAILED'
        const retryable = isRetryableFieldDeliveryFailure({
          code,
          status: readTripRequestErrorStatus(error),
        })
        outcomes[photoIndex] = retryable ? 'pending' : 'rejected'
      }
    }
    cargoPhotoOutcomesRef.current[draft.documentId] = outcomes
    return {
      cargoPending: outcomes.filter((outcome) => outcome === 'pending').length,
      cargoRejected: outcomes.filter((outcome) => outcome === 'rejected').length,
    }
  }

  function buildDeliveredOutcome(
    kind: 'alreadySettled' | 'delivered',
    cargo: Readonly<{ cargoPending: number; cargoRejected: number }>,
  ): FieldDeliverySendOutcome {
    return {
      kind,
      ...(cargo.cargoPending === 0 ? {} : { cargoPending: cargo.cargoPending }),
      ...(cargo.cargoRejected === 0 ? {} : { cargoRejected: cargo.cargoRejected }),
    }
  }

  async function sendDraft(
    draft: FieldDeliveryDraft,
    signal: AbortSignal,
  ): Promise<FieldDeliverySendOutcome> {
    /** Achado de revisão (spec 182): a nota já teve a baixa confirmada numa tentativa anterior —
     * o retry aqui é só de foto de carga, nunca repete `reportFieldDelivery`. */
    const previousDeliveryKind = deliveryResultRef.current[draft.documentId]
    if (previousDeliveryKind !== undefined) {
      const cargo = await sendCargoPhotos(draft, signal)
      return buildDeliveredOutcome(previousDeliveryKind, cargo)
    }
    try {
      const result = await input.reportFieldDelivery({
        deliveredAt: draft.deliveredAt,
        documentId: draft.documentId,
        idempotencyKey: resolveIdempotencyKey(draft.documentId),
        imageBlob: draft.imageBlob,
        signal,
        tripId: input.tripId,
        ...(draft.driverId === undefined ? {} : { driverId: draft.driverId }),
        ...(draft.receiverDocument === undefined
          ? {}
          : { receiverDocument: draft.receiverDocument }),
        ...(draft.receiverName === undefined ? {} : { receiverName: draft.receiverName }),
      })
      const kind = result.alreadySettled ? 'alreadySettled' : 'delivered'
      deliveryResultRef.current[draft.documentId] = kind
      const cargo = await sendCargoPhotos(draft, signal)
      return buildDeliveredOutcome(kind, cargo)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'REQUEST_FAILED'
      /** M13a: só erro transitório (rede/5xx/429, ou TRIP_STATUS_WRITE_CONFLICT) é reenviável —
       * 400/422 é recusa terminal do que foi enviado, e reenviar o mesmo corpo repete o mesmo erro. */
      const retryable = isRetryableFieldDeliveryFailure({
        code,
        status: readTripRequestErrorStatus(error),
      })
      return { code, kind: 'failed', retryable }
    }
  }

  async function runBatch(drafts: readonly FieldDeliveryDraft[]): Promise<void> {
    if (drafts.length === 0) return
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsSubmitting(true)
    await runFieldDeliverySendBatch({
      drafts,
      onSettle: (documentId, outcome) => {
        if (controller.signal.aborted) return
        setStatusByDocumentId((previous) => ({ ...previous, [documentId]: outcome }))
      },
      onStart: (documentId) => {
        if (controller.signal.aborted) return
        setStatusByDocumentId((previous) => ({ ...previous, [documentId]: { kind: 'sending' } }))
      },
      send: (draft) => sendDraft(draft, controller.signal),
    })
    if (controller.signal.aborted) return
    setIsSubmitting(false)
    await input.invalidate()
  }

  function submit(drafts: readonly FieldDeliveryDraft[]): void {
    if (drafts.length === 0) return
    for (const draft of drafts) draftsRef.current[draft.documentId] = draft
    setStatusByDocumentId((previous) => {
      const next = { ...previous }
      for (const draft of drafts) next[draft.documentId] = { kind: 'pending' }
      return next
    })
    void runBatch(drafts)
  }

  /**
   * Spec 182 D5: além da nota que falhou (existente), reenvia a nota já entregue que ainda tem foto
   * de carga pendente — `reportFieldDelivery` reenviado com a mesma `Idempotency-Key` é idempotente
   * (não duplica a baixa), e `sendCargoPhotos` reusa a chave de cada foto (não duplica a foto).
   */
  function retryFailed(): void {
    const failedDrafts = Object.entries(statusByDocumentId)
      .filter(([, status]) => {
        if (status.kind === 'failed') return status.retryable
        if (status.kind === 'delivered' || status.kind === 'alreadySettled') {
          return (status.cargoPending ?? 0) > 0
        }
        return false
      })
      .map(([documentId]) => draftsRef.current[documentId])
      .filter((draft): draft is FieldDeliveryDraft => draft !== undefined)
    submit(failedDrafts)
  }

  function reset(): void {
    abortControllerRef.current?.abort()
    abortControllerRef.current = undefined
    setStatusByDocumentId({})
    setIsSubmitting(false)
    draftsRef.current = {}
    idempotencyKeysRef.current = {}
    cargoIdempotencyKeysRef.current = {}
    cargoPhotoOutcomesRef.current = {}
    deliveryResultRef.current = {}
  }

  return { isSubmitting, reset, retryFailed, statusByDocumentId, submit }
}
