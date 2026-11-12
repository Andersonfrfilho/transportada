/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type ExpireDueWhatsAppChatsInput = {
  readonly limit: number
  readonly now: Date
}

/** Devolve ao bot **um lote** de conversas com o prazo do atendente vencido e diz quantas voltaram. */
export type ExpireDueWhatsAppChats = (input: ExpireDueWhatsAppChatsInput) => Promise<number>
