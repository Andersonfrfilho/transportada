/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b: o que o envio do escritório entrega depois da transação — o destinatário, o protocolo e
 * o rótulo do aviso — e o aviso em si, que nunca desfaz a mensagem.
 */
import type { OfficeSubjectInput } from './office-subject-access.service.js'
import type { OfficeSubjectNotifierPort } from './office-subject-conversation.port.js'

export type OfficeDelivery = {
  readonly driverUserId: string
  readonly protocol: string
  readonly subjectLabel: string
}

/** Depois da transação: o aviso é conveniência, a mensagem já está na conversa. */
export async function notifyOfficeDriver(
  notifier: OfficeSubjectNotifierPort,
  input: OfficeSubjectInput,
  delivery: OfficeDelivery,
  messageId: string,
): Promise<void> {
  try {
    await notifier.notify({
      companyId: input.companyId,
      dedupeKey: messageId,
      protocol: delivery.protocol,
      recipientUserId: delivery.driverUserId,
      subjectId: input.subjectId,
      subjectLabel: delivery.subjectLabel,
      subjectType: input.subjectType,
    })
  } catch {
    // O notificador registra a própria falha.
  }
}
