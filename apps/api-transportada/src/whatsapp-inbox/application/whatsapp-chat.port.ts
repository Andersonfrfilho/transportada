/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T2: a porta da caixa de conversas do WhatsApp. Todo método recebe `companyId` (tenant), exceto o
 * `expireDue` do job da T7, que varre a instalação e devolve a empresa de cada chat.
 */
import type {
  WhatsAppChatContentKind,
  WhatsAppChatFailureReason,
  WhatsAppChatKind,
  WhatsAppChatMessageAuthor,
  WhatsAppChatMessageDirection,
  WhatsAppChatMessageStatus,
  WhatsAppChatReleaseReason,
  WhatsAppChatState,
} from '../domain/whatsapp-chat.constant.js'

export type WhatsAppChat = {
  readonly chatJid: string
  readonly companyId: string
  readonly createdAt: Date
  readonly expiresAt: Date | null
  readonly id: string
  readonly kind: WhatsAppChatKind
  readonly lastInboundAt: Date | null
  readonly lastMessageAt: Date | null
  readonly readAt: Date | null
  readonly releaseReason: WhatsAppChatReleaseReason | null
  readonly releasedAt: Date | null
  readonly releasedByUserId: string | null
  readonly state: WhatsAppChatState
  readonly takenOverAt: Date | null
  readonly takenOverByUserId: string | null
}

export type WhatsAppChatMessage = {
  readonly author: WhatsAppChatMessageAuthor
  readonly authorUserId: string | null
  readonly bodyText: string
  readonly chatId: string
  readonly companyId: string
  readonly contentKind: WhatsAppChatContentKind
  readonly direction: WhatsAppChatMessageDirection
  readonly failureReason: WhatsAppChatFailureReason | null
  readonly id: string
  readonly occurredAt: Date
  readonly providerMessageId: string | null
  readonly senderPhone: string | null
  readonly status: WhatsAppChatMessageStatus | null
}

export type WhatsAppChatKey = { readonly chatId: string; readonly companyId: string }

export type WhatsAppChatTakeOverResult =
  | { readonly chat: WhatsAppChat; readonly outcome: 'taken' | 'renewed' }
  | { readonly expiresAt: Date; readonly holderUserId: string; readonly outcome: 'held' }
  | { readonly outcome: 'not_found' }

export type WhatsAppChatReleaseResult =
  | { readonly chat: WhatsAppChat; readonly outcome: 'released' | 'already_bot' }
  | { readonly outcome: 'not_found' }

export type NewWhatsAppChatMessage = {
  readonly author: WhatsAppChatMessageAuthor
  /** Só o atendente (`operator`). */
  readonly authorUserId?: string | null
  readonly bodyText: string
  readonly chatId: string
  readonly companyId: string
  readonly contentKind?: WhatsAppChatContentKind
  /** Padrão: agora, pelo banco. */
  readonly occurredAt?: Date
  readonly providerMessageId?: string | null
  /** Só a recebida no grupo: quem escreveu (dígitos). */
  readonly senderPhone?: string | null
}

export type WhatsAppChatAppendResult = {
  readonly message: WhatsAppChatMessage
  /** `duplicate`: o `provider_message_id` já estava gravado (eco do envio ou reentrega do webhook); nada mudou. */
  readonly outcome: 'inserted' | 'duplicate'
}

export type WhatsAppChatMessageStatusUpdate = {
  readonly companyId: string
  readonly failureReason?: WhatsAppChatFailureReason | null
  readonly status: WhatsAppChatMessageStatus
} & (
  | { readonly messageId: string; readonly providerMessageId?: string | null }
  | { readonly messageId?: undefined; readonly providerMessageId: string }
)

export type WhatsAppChatExpired = {
  readonly chatId: string
  readonly companyId: string
  /** Quem segurava: a T7 avisa/audita em nome dele. */
  readonly userId: string
}

export type WhatsAppChatRepositoryPort = {
  /** O chat do JID, criado com o bot se ainda não existe (idempotente, também sob concorrência). */
  readonly ensureChat: (input: {
    readonly chatJid: string
    readonly companyId: string
    readonly kind: WhatsAppChatKind
  }) => Promise<WhatsAppChat>
  readonly findChat: (input: WhatsAppChatKey) => Promise<WhatsAppChat | null>
  readonly findChatByJid: (input: {
    readonly chatJid: string
    readonly companyId: string
  }) => Promise<WhatsAppChat | null>
  /**
   * Assumir atômico: um `UPDATE … WHERE state = 'bot' OR expires_at <= now OR taken_over_by = userId`. Quem perde a
   * corrida recebe `held` com quem segura.
   */
  readonly takeOver: (
    input: WhatsAppChatKey & {
      readonly expiresAt: Date
      readonly now: Date
      readonly userId: string
    },
  ) => Promise<WhatsAppChatTakeOverResult>
  /** Empurra o vencimento só se `userId` ainda segura e o prazo não venceu (RF6: cada mensagem do atendente). */
  readonly extendTakeover: (
    input: WhatsAppChatKey & {
      readonly expiresAt: Date
      readonly now: Date
      readonly userId: string
    },
  ) => Promise<WhatsAppChat | null>
  /** Devolver ao bot. `manual` grava quem devolveu; `already_bot` quando nada havia para devolver. */
  readonly release: (
    input: WhatsAppChatKey & {
      readonly now: Date
      readonly userId: string
    },
  ) => Promise<WhatsAppChatReleaseResult>
  /** T7: devolve ao bot, com `expired`, os chats cujo prazo passou. Em lote, sem empresa. */
  readonly expireDue: (input: {
    readonly limit: number
    readonly now: Date
  }) => Promise<readonly WhatsAppChatExpired[]>
  /** Grava no histórico e atualiza `last_message_at`/`last_inbound_at` do chat, na mesma transação. */
  readonly appendMessage: (input: NewWhatsAppChatMessage) => Promise<WhatsAppChatAppendResult>
  /** Avança o status só para a frente (`canAdvanceWhatsAppChatMessageStatus`); `null` se não achou ou não avançou. */
  readonly updateMessageStatus: (
    input: WhatsAppChatMessageStatusUpdate,
  ) => Promise<WhatsAppChatMessage | null>
  /** O prazo de devolução configurado da empresa; `null` sem Evolution cadastrado. */
  readonly findTakeoverTimeoutSeconds: (input: {
    readonly companyId: string
  }) => Promise<number | null>
}
