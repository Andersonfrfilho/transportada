/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T6: o que a caixa precisa do Evolution para falar como o número do bot. Fica estreita de propósito: o
 * gateway real (`createEvolutionDocumentSender`) entra na composição, e o erro dele traz o motivo fechado em `failure`.
 */
export type WhatsAppChatTextSender = {
  readonly sendText: (input: {
    readonly body: string
    readonly companyId: string
    /** Grupo: o JID inteiro. Privado: só os dígitos. */
    readonly number: string
  }) => Promise<{ readonly providerMessageId: string | null }>
}
