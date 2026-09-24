/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF9 (D6): para onde vai a mensagem que chega pelo WhatsApp — e nunca por palpite.
 *
 * - Resposta (`context.id`) a uma mensagem da conversa: vai para ela, desde que quem responde seja
 *   parte daquela conversa (o motorista dela, ou contato com aceite da contratante dela).
 * - Motorista sem essa resposta: segue para os fluxos de comando da spec 144, exatamente como hoje.
 *   Número que é de motorista e também de contato fica no fluxo de comando: a conversa não rouba
 *   mensagem do WhatsApp de comando.
 * - Contratante sem resposta: vai para a única conversa aberta das contratantes do contato; duas ou
 *   nenhuma vão para "não atribuída", e o operador escolhe. A spec diz "a mais recente", mas também
 *   "mais de uma candidata vai para não atribuída" — as duas só se conciliam com uma candidata.
 * - Número sem aceite, ou que não é de contato: recusado (D6).
 */
export type WhatsAppAttributionInput = {
  readonly openContractorConversations: readonly {
    readonly contractorId: string
    readonly conversationId: string
  }[]
  /** A conversa da mensagem que o `context.id` referencia; `null` sem referência ou se não é nossa. */
  readonly replyTo: null | {
    readonly contractorId: null | string
    readonly conversationId: string
    readonly driverUserId: null | string
    readonly participant: 'contractor' | 'driver'
  }
  readonly sender: {
    /** Os contatos, de qualquer contratante da empresa, com este número. */
    readonly contractorContacts: readonly {
      readonly contactId: string
      readonly contractorId: string
      readonly optedIn: boolean
    }[]
    /** O motorista cujo WhatsApp verificado é este número. */
    readonly driverUserId: null | string
  }
}

export type WhatsAppAttribution =
  | { readonly conversationId: string; readonly kind: 'conversation'; readonly via: 'reply' }
  | { readonly conversationId: string; readonly kind: 'conversation'; readonly via: 'single_open' }
  | { readonly kind: 'command_flow' }
  | { readonly kind: 'rejected'; readonly reason: 'no_opt_in' | 'not_a_contact' }
  | { readonly kind: 'unassigned'; readonly reason: 'ambiguous' | 'no_open_conversation' }

export function resolveWhatsAppAttribution(input: WhatsAppAttributionInput): WhatsAppAttribution {
  const { replyTo, sender } = input
  const optedInContractorIds = new Set(
    sender.contractorContacts
      .filter((contact) => contact.optedIn)
      .map((contact) => contact.contractorId),
  )

  if (replyTo !== null) {
    const isDriverReply =
      replyTo.participant === 'driver' &&
      sender.driverUserId !== null &&
      replyTo.driverUserId === sender.driverUserId
    const isContractorReply =
      replyTo.participant === 'contractor' &&
      replyTo.contractorId !== null &&
      optedInContractorIds.has(replyTo.contractorId)
    if (isDriverReply || isContractorReply) {
      return { conversationId: replyTo.conversationId, kind: 'conversation', via: 'reply' }
    }
  }

  if (sender.driverUserId !== null) return { kind: 'command_flow' }
  if (sender.contractorContacts.length === 0) return { kind: 'rejected', reason: 'not_a_contact' }
  if (optedInContractorIds.size === 0) return { kind: 'rejected', reason: 'no_opt_in' }

  const candidates = input.openContractorConversations.filter((conversation) =>
    optedInContractorIds.has(conversation.contractorId),
  )
  const [single] = candidates
  if (candidates.length === 1 && single !== undefined) {
    return { conversationId: single.conversationId, kind: 'conversation', via: 'single_open' }
  }
  return {
    kind: 'unassigned',
    reason: candidates.length === 0 ? 'no_open_conversation' : 'ambiguous',
  }
}
