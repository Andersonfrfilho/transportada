/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T5 (D6, RF7): o que a resposta do painel ao cliente lê e grava. A empresa vem sempre do contexto; o número
 * só existe aqui dentro e no envio ao Evolution, nunca na resposta da API nem no log.
 */
import type { WhatsAppEvolutionStatus } from '../../database/whatsapp-evolution.schema.js'
import type { ClientChannel } from '../../shared/delivery-client-email.constant.js'
import type {
  ClientChannelMessage,
  ClientConversationChannel,
} from '../domain/client-conversation.policy.js'

export type ClientReplyMessageStatus = 'failed' | 'queued' | 'sent'

export type ClientReplyContext = {
  readonly clientChannel: ClientChannel
  readonly contacts: readonly {
    readonly address: string
    readonly channel: ClientConversationChannel
  }[]
  readonly conversationId: string
  readonly evolutionStatus: null | WhatsAppEvolutionStatus
  readonly messages: readonly ClientChannelMessage[]
}

export type ClientReplyRepositoryPort = {
  /** `null` quando a ocorrência não é desta empresa ou ainda não tem conversa do cliente. */
  readContext(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ClientReplyContext | null>
  /** A mesma `Idempotency-Key` na mesma conversa devolve a mensagem já gravada. */
  findByIdempotencyKey(params: {
    readonly companyId: string
    readonly conversationId: string
    readonly idempotencyKey: string
  }): Promise<null | { readonly id: string; readonly status: ClientReplyMessageStatus }>
  /** `queued`; `null` quando a chave já gravou outra (corrida de duas abas): quem chama relê pela chave. */
  insertQueued(params: {
    readonly actorUserId: string
    readonly bodyText: string
    readonly companyId: string
    readonly conversationId: string
    readonly idempotencyKey: string
    readonly recipientAddress: string
  }): Promise<null | { readonly id: string }>
  /** Só a mensagem ainda `queued` muda: fechar duas vezes não faz nada. */
  markSent(params: {
    readonly companyId: string
    readonly messageId: string
    readonly providerMessageId: null | string
  }): Promise<void>
  markFailed(params: { readonly companyId: string; readonly messageId: string }): Promise<void>
}

/** O Evolution da empresa. Erro de envio sai como `ContractorReplyWhatsAppSendError` (281 T5). */
export type ClientReplyWhatsAppSenderPort = {
  isConnected(params: { readonly companyId: string }): Promise<boolean>
  sendText(params: {
    readonly body: string
    readonly companyId: string
    readonly number: string
  }): Promise<{ readonly providerMessageId: null | string }>
}
