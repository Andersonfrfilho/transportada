/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AttachmentStore } from './offlineAttachments.service'
import type { OfflineQueueStore } from './offlineQueue.service'

/**
 * Decisão do usuário (ADR-0075 §6, "descartar com ciência"; spec 227): o recusado pelo servidor só
 * sobe por envio manual, e a recusa costuma se repetir. Sem o prazo de 7 dias, o descarte é a única
 * saída de um item que nunca vai sincronizar — e é sempre pela mão do motorista. A tela pede confirmação e avisa que a entrega não foi
 * registrada; aqui só se garante que sai **só o que foi recusado**, com o dado junto.
 *
 * - Evento recusado sai com o grupo de anexos dele: a foto de uma entrega que o servidor não aceitou
 *   não tem a que se prender.
 * - Anexo recusado sai sozinho: o evento aceito permanece aceito, e os outros anexos ainda sobem.
 */
export async function discardRejectedQueueItem(input: {
  readonly attachmentStore: AttachmentStore
  readonly idempotencyKey: string
  readonly store: OfflineQueueStore
}): Promise<void> {
  let isRejectedEventRemoved = false
  await input.store.update((items) =>
    items.filter((item) => {
      const isTarget =
        item.report.idempotencyKey === input.idempotencyKey && item.rejectionCause !== undefined
      if (isTarget) isRejectedEventRemoved = true
      return !isTarget
    }),
  )

  await input.attachmentStore.update({
    eventKey: input.idempotencyKey,
    mutate: (attachments) =>
      isRejectedEventRemoved
        ? []
        : attachments.filter((attachment) => attachment.rejectionCause === undefined),
  })
}

/** Tipos de item que o motorista pode cancelar enquanto ainda estão só no aparelho. */
const CANCELLABLE_QUEUED_KINDS: ReadonlySet<string> = new Set([
  'documentOccurrence',
  'occurrence',
  'stopOccurrenceCharge',
  'stopOccurrencePhoto',
])

/** Ocorrência ainda na fila (aguardando ou com falha de tentativa) — o servidor nunca a recebeu. */
export function isQueuedOccurrenceCancellable(input: {
  readonly kind: string
  readonly state: string
}): boolean {
  return (
    CANCELLABLE_QUEUED_KINDS.has(input.kind) &&
    (input.state === 'queued' || input.state === 'failed')
  )
}

/**
 * O atendimento já resolveu a ocorrência e o motorista não quer mais enviá-la: sai da fila só ela,
 * com as fotos/anexos dela. Item de outro tipo (entrega, chegada, rota) nunca é removido por aqui.
 * Devolve `true` quando algo saiu.
 */
export async function cancelQueuedOccurrence(input: {
  readonly attachmentStore: AttachmentStore
  readonly idempotencyKey: string
  readonly store: OfflineQueueStore
}): Promise<boolean> {
  let isRemoved = false
  await input.store.update((items) =>
    items.filter((item) => {
      const isTarget =
        item.report.idempotencyKey === input.idempotencyKey &&
        CANCELLABLE_QUEUED_KINDS.has(item.report.kind)
      if (isTarget) isRemoved = true
      return !isTarget
    }),
  )
  if (isRemoved) {
    await input.attachmentStore.update({
      eventKey: input.idempotencyKey,
      mutate: () => [],
    })
  }
  return isRemoved
}
