/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { EventQueueItemView } from './eventQueueView.service'
import type { QueuedAttachment } from './offlineAttachments.service'
import { resolveRejectionCauseCode } from './rejectionCauseLabel.service'

/** Spec 294 RF26: a nota já tem um canhoto diferente; o servidor só troca com a confirmação. */
export const CANHOTO_ALREADY_ATTACHED_CODE = 'TRIP_CANHOTO_ALREADY_ATTACHED'

export type CanhotoReplacePrompt = Readonly<{
  /** A chave do grupo de anexos (a do evento de entrega) — é por ela que a fila a encontra. */
  eventKey: string
}>

function isCanhotoRefused(cause: string | undefined): boolean {
  return cause !== undefined && resolveRejectionCauseCode(cause) === CANHOTO_ALREADY_ATTACHED_CODE
}

/** O primeiro canhoto recusado por "a nota já tem outro" — com o evento ainda na fila ou já enviado. */
export function resolveCanhotoReplacePrompt(
  queueView: readonly EventQueueItemView[],
): CanhotoReplacePrompt | undefined {
  const item = queueView.find(
    (view) =>
      isCanhotoRefused(view.attachmentRejectionCause) ||
      (view.kind === 'proof' &&
        view.status.state === 'rejected' &&
        isCanhotoRefused(view.status.cause)),
  )
  return item === undefined ? undefined : { eventKey: item.idempotencyKey }
}

/** "Trocar o canhoto": a foto volta à fila com a confirmação e sem a recusa. */
export function markCanhotoReplaceConfirmed(
  items: readonly QueuedAttachment[],
): readonly QueuedAttachment[] {
  return items.map((item) => {
    if (item.kind !== 'photo' || !isCanhotoRefused(item.rejectionCause)) return item
    const confirmed: QueuedAttachment = { ...item, attempts: 0, replaceCanhoto: true }
    delete (confirmed as { rejectionCause?: string }).rejectionCause
    return confirmed
  })
}

/** "Manter o que já tem": a foto recusada sai do aparelho; o canhoto que está na nota fica. */
export function discardRefusedCanhoto(
  items: readonly QueuedAttachment[],
): readonly QueuedAttachment[] {
  return items.filter((item) => !(item.kind === 'photo' && isCanhotoRefused(item.rejectionCause)))
}
