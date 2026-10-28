/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6 (D6, RF4): para onde vai a mensagem que chega pelo número do Evolution. É a política da
 * Meta (spec 183, `whatsapp-attribution.policy.ts`) com duas diferenças, e nenhuma por palpite:
 *
 * - **Quem recebeu o boleto pode responder a ele.** A resposta que cita a mensagem enviada pelo
 *   Evolution vai para a conversa dela quando vem do mesmo número a que ela foi entregue (T5 grava o
 *   número na entrega). É o caso do cliente do supermercado, que não é contato da contratante.
 * - **Nada é recusado.** O Evolution não tem o fluxo de comando da 144 nem o aceite da Meta: o que
 *   não casa com uma conversa vai para "não atribuídas" e o operador escolhe (D6: "não é descartado").
 * - **Spec 283 (RF3): a resposta de quem recebeu entra na conversa do cliente** daquela entrega, quando ela existe
 *   (o gatilho da T2 a cria no envio). Sem ela, segue na conversa da mensagem citada, como na 281.
 *   O teto por número no serviço é o que segura o abuso.
 */
import type { WhatsAppAttributionInput } from './whatsapp-attribution.policy.js'

export type EvolutionAttributionInput = WhatsAppAttributionInput & {
  /** Spec 283: a conversa do cliente da entrega que a mensagem citada conta; `null` sem ela. */
  readonly replyToClientConversationId: null | string
  /**
   * A chave do número (`toWhatsAppPhoneKey`) para o qual a mensagem citada foi entregue, quando ela é
   * um envio com entrega gravada (o boleto da T5); `null` sem citação ou sem entrega.
   */
  readonly replyToRecipientPhoneKey: null | string
  readonly senderPhoneKey: string
}

export type EvolutionAttribution =
  | {
      readonly conversationId: string
      readonly driverUserId: null | string
      readonly kind: 'conversation'
      readonly via: 'recipient_reply' | 'reply' | 'single_open'
    }
  | {
      readonly kind: 'unassigned'
      readonly reason: 'ambiguous' | 'no_open_conversation' | 'not_a_contact'
    }

export function resolveEvolutionAttribution(
  input: EvolutionAttributionInput,
): EvolutionAttribution {
  const { replyTo, sender } = input
  const optedInContractorIds = new Set(
    sender.contractorContacts
      .filter((contact) => contact.optedIn)
      .map((contact) => contact.contractorId),
  )

  if (replyTo !== null) {
    if (
      replyTo.participant === 'driver' &&
      sender.driverUserId !== null &&
      replyTo.driverUserId === sender.driverUserId
    ) {
      return {
        conversationId: replyTo.conversationId,
        driverUserId: sender.driverUserId,
        kind: 'conversation',
        via: 'reply',
      }
    }
    if (
      replyTo.participant === 'contractor' &&
      replyTo.contractorId !== null &&
      optedInContractorIds.has(replyTo.contractorId)
    ) {
      return {
        conversationId: replyTo.conversationId,
        driverUserId: null,
        kind: 'conversation',
        via: 'reply',
      }
    }
    if (
      input.replyToRecipientPhoneKey !== null &&
      input.replyToRecipientPhoneKey === input.senderPhoneKey
    ) {
      return {
        conversationId: input.replyToClientConversationId ?? replyTo.conversationId,
        driverUserId: null,
        kind: 'conversation',
        via: 'recipient_reply',
      }
    }
  }

  /** Spec 283 T5: a citada é a resposta do painel na conversa do cliente (sem aviso nem `replyTo` de participante). */
  if (
    replyTo === null &&
    input.replyToClientConversationId !== null &&
    input.replyToRecipientPhoneKey !== null &&
    input.replyToRecipientPhoneKey === input.senderPhoneKey
  ) {
    return {
      conversationId: input.replyToClientConversationId,
      driverUserId: null,
      kind: 'conversation',
      via: 'recipient_reply',
    }
  }

  if (optedInContractorIds.size === 0) {
    return {
      kind: 'unassigned',
      reason:
        sender.contractorContacts.length === 0 && sender.driverUserId === null
          ? 'not_a_contact'
          : 'no_open_conversation',
    }
  }

  const candidates = input.openContractorConversations.filter((conversation) =>
    optedInContractorIds.has(conversation.contractorId),
  )
  const [single] = candidates
  if (candidates.length === 1 && single !== undefined && sender.driverUserId === null) {
    return {
      conversationId: single.conversationId,
      driverUserId: null,
      kind: 'conversation',
      via: 'single_open',
    }
  }
  return {
    kind: 'unassigned',
    reason: candidates.length === 0 ? 'no_open_conversation' : 'ambiguous',
  }
}
