/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import {
  runFieldDeliverySendBatch,
  type FieldDeliverySendOutcome,
  type FieldDeliverySendStatus,
} from '../shared/fieldDeliverySend.service'
import type { FieldDeliveryDraft } from '../shared/fieldDeliveryWizard.service'
import type { ReportFieldDeliveryInput, ReportFieldDeliveryResult } from '../shared/trip.types'

export type { FieldDeliverySendStatus } from '../shared/fieldDeliverySend.service'

export type UseFieldDeliveryInput = Readonly<{
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

  async function sendDraft(
    draft: FieldDeliveryDraft,
    signal: AbortSignal,
  ): Promise<FieldDeliverySendOutcome> {
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
      return { kind: result.alreadySettled ? 'alreadySettled' : 'delivered' }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'REQUEST_FAILED'
      return { code, kind: 'failed' }
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

  function retryFailed(): void {
    const failedDrafts = Object.entries(statusByDocumentId)
      .filter(([, status]) => status.kind === 'failed')
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
  }

  return { isSubmitting, reset, retryFailed, statusByDocumentId, submit }
}
