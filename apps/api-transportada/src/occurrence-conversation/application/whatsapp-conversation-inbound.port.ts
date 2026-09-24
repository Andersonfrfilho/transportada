/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T502 (RF9): o que o hook da conversa lê e grava. Toda leitura e escrita vai pela empresa
 * da sessão do módulo (descoberta pelo `phone_number_id` já assinado), nunca por um campo da mensagem.
 */
import type { WhatsAppAttributionInput } from '../domain/whatsapp-attribution.policy.js'

export type WhatsAppConversationInboundPort = {
  /** Quem é o número (contatos, motorista), a conversa da referência de resposta e as candidatas. */
  loadAttributionContext(input: {
    readonly companyId: string
    readonly phone: string
    readonly replyToProviderMessageId: null | string
  }): Promise<WhatsAppAttributionInput>
  /** Idempotente pelo id da Meta: a reentrega do webhook não duplica a mensagem. */
  recordConversationMessage(input: {
    readonly bodyText: string
    readonly companyId: string
    readonly conversationId: string
    readonly driverUserId: null | string
    readonly providerMessageId: string
    readonly receivedAt: Date
    readonly senderAddress: null | string
  }): Promise<void>
  /** Idempotente pelo id da Meta. */
  recordUnassigned(input: {
    readonly bodyText: string
    readonly companyId: string
    readonly contractorContactId: null | string
    readonly providerMessageId: string
    readonly receivedAt: Date
    readonly senderAddress: string
  }): Promise<void>
}
