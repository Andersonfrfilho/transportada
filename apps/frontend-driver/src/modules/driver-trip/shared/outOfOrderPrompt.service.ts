/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { EventQueueItemView } from './eventQueueView.service'
import type { QueuedReport } from './offlineQueue.service'
import { resolveRejectionCauseCode } from './rejectionCauseLabel.service'

/** Spec 294 RF27: o `409` da API quando o toque não é da parada em andamento nem da próxima do roteiro. */
export const OUT_OF_ORDER_CODE = 'TRIP_STOP_OUT_OF_ORDER'

const CONFIRMABLE_KINDS = ['arrive', 'deliver', 'depart', 'return'] as const
type ConfirmableKind = (typeof CONFIRMABLE_KINDS)[number]

export type OutOfOrderPrompt = Readonly<{
  /** A parada que o motorista iniciou ou chegou, quando há uma (senão é saída fora da próxima). */
  currentSequence: number | undefined
  idempotencyKey: string
  kind: ConfirmableKind
  nextSequence: number | undefined
  requestedSequence: number | undefined
}>

function isConfirmableKind(kind: string): kind is ConfirmableKind {
  return (CONFIRMABLE_KINDS as readonly string[]).includes(kind)
}

function readSequence(
  details: readonly { readonly field: string; readonly message: string }[],
  field: string,
): number | undefined {
  const value = Number(details.find((detail) => detail.field === field)?.message)
  return Number.isFinite(value) ? value : undefined
}

/** O primeiro toque recusado por fora de ordem — o diálogo pergunta um de cada vez. */
export function resolveOutOfOrderPrompt(
  queueView: readonly EventQueueItemView[],
): OutOfOrderPrompt | undefined {
  for (const item of queueView) {
    if (item.status.state !== 'rejected' || !isConfirmableKind(item.kind)) continue
    if (resolveRejectionCauseCode(item.status.cause) !== OUT_OF_ORDER_CODE) continue
    const details = item.status.details ?? []
    return {
      currentSequence: readSequence(details, 'currentSequence'),
      idempotencyKey: item.idempotencyKey,
      kind: item.kind,
      nextSequence: readSequence(details, 'nextSequence'),
      requestedSequence: readSequence(details, 'requestedSequence'),
    }
  }
  return undefined
}

/**
 * "Registrar mesmo assim": o item volta à fila com a confirmação e sem a recusa, e sobe na ordem de sempre.
 * A confirmação vale para este toque só — outro toque fora da ordem pergunta de novo.
 */
export function markOutOfOrderConfirmed(
  items: readonly QueuedReport[],
  idempotencyKey: string,
): readonly QueuedReport[] {
  return items.map((item) => {
    const report = item.report
    if (report.idempotencyKey !== idempotencyKey || !isConfirmableKind(report.kind)) return item
    const confirmed: Record<string, unknown> = {
      ...item,
      attempts: 0,
      report: { ...report, confirmOutOfOrder: true },
    }
    delete confirmed.rejectionCause
    delete confirmed.rejectionDetails
    return confirmed as QueuedReport
  })
}
