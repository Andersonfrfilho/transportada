/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AttachmentStore } from './offlineAttachments.service'
import type { OfflineQueueStore } from './offlineQueue.service'

/**
 * Decisão do usuário (ADR-0075 §6, "descartar com ciência"): o recusado pelo servidor só sobe por
 * envio manual, e a recusa costuma se repetir — sem descarte, a fila antiga nunca esvaziaria e o
 * motorista ficaria preso no painel. A tela pede confirmação e avisa que a entrega não foi
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
