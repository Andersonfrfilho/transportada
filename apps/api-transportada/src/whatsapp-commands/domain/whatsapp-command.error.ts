/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { WhatsAppActorDenialReason } from '../application/resolve-whatsapp-actor.use-case.js'

/** As quatro recusas do ator mais a de permissão; o teto por número não passa por aqui. */
export type WhatsAppCommandDenialReason = WhatsAppActorDenialReason | 'permission'

/**
 * Lançada pela FlowAction que re-resolveu o ator e não o achou apto. O despachante a converte na
 * mesma resposta neutra da recusa de entrada: o número nunca sabe por que foi recusado.
 */
/**
 * T020 (B5): a FlowAction recusou duas respostas seguidas fora da lista relida. Quem chama uma
 * pessoa é o despachante, pelo mesmo `handOff` da resposta fora do menu (T006, D8).
 */
export class WhatsAppCommandHandoffRequestedError extends Error {
  public constructor() {
    super('WhatsApp command handoff requested.')
    this.name = 'WhatsAppCommandHandoffRequestedError'
  }
}

export class WhatsAppCommandDeniedError extends Error {
  public readonly reason: WhatsAppCommandDenialReason

  public constructor(reason: WhatsAppCommandDenialReason) {
    super('WhatsApp command denied.')
    this.name = 'WhatsAppCommandDeniedError'
    this.reason = reason
  }
}
