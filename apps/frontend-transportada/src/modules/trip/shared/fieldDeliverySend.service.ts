/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FieldDeliveryDraft } from './fieldDeliveryWizard.service'

/** Spec 156 T12 (aceite 5/7): 3 chamadas em paralelo, nunca mais — o resto espera na fila. */
export const FIELD_DELIVERY_SEND_CONCURRENCY = 3

/**
 * O que sobra de uma chamada: `alreadySettled` é o 409 `DOCUMENT_ALREADY_SETTLED` (aceite 12),
 * tratado como "já estava entregue" — informativo, não uma falha vermelha (D3/aceite 7).
 */
export type FieldDeliverySendOutcome =
  | Readonly<{ kind: 'alreadySettled' }>
  | Readonly<{ kind: 'delivered' }>
  | Readonly<{ code: string; kind: 'failed'; retryable: boolean }>

/**
 * M13a (spec 156 T15): só erro transitório é reenviável — rede (sem status: nunca chegou a ter
 * resposta), `429` (rate limit) e `5xx`. `400`/`422` são recusa terminal do que foi enviado
 * (validação/regra de negócio): reenviar o mesmo corpo produz o mesmo erro, e "tentar de novo" ali
 * só engana quem clicou.
 */
export function isRetryableFieldDeliveryStatus(status: number | undefined): boolean {
  if (status === undefined) return true
  if (status === 429) return true
  return status >= 500
}

export type FieldDeliverySendStatus =
  | FieldDeliverySendOutcome
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'sending' }>

export type FieldDeliverySendBatchInput = Readonly<{
  concurrency?: number
  drafts: readonly FieldDeliveryDraft[]
  onSettle: (documentId: string, outcome: FieldDeliverySendOutcome) => void
  onStart: (documentId: string) => void
  send: (draft: FieldDeliveryDraft) => Promise<FieldDeliverySendOutcome>
}>

/**
 * Envia o lote nota a nota, no máximo `concurrency` chamadas simultâneas — cada worker puxa a
 * próxima nota da fila assim que termina a anterior, então uma nota lenta nunca segura as outras
 * (aceite 7: falha de uma não interrompe o resto). `send` nunca lança: quem chama já traduziu
 * qualquer rejeição em `{ kind: 'failed', code }` antes de chegar aqui — é o que mantém este
 * orquestrador puro o bastante para testar sem rede nem DOM.
 */
export async function runFieldDeliverySendBatch(input: FieldDeliverySendBatchInput): Promise<void> {
  const queue = [...input.drafts]
  const concurrency = Math.max(
    1,
    Math.min(input.concurrency ?? FIELD_DELIVERY_SEND_CONCURRENCY, queue.length),
  )

  async function worker(): Promise<void> {
    for (;;) {
      const draft = queue.shift()
      if (draft === undefined) return
      input.onStart(draft.documentId)
      const outcome = await input.send(draft)
      input.onSettle(draft.documentId, outcome)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
}
