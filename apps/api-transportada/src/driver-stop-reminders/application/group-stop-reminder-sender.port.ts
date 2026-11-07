/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type GroupStopReminderSendParams = {
  readonly body: string
  readonly companyId: string
  readonly groupJid: string
  readonly tripId: string
}

/** O lembrete proativo no grupo: fora de qualquer turno, devolve o id do provedor e lança se o envio falhar. */
export type GroupStopReminderSenderPort = {
  send(params: GroupStopReminderSendParams): Promise<{ readonly providerMessageId: null | string }>
}
