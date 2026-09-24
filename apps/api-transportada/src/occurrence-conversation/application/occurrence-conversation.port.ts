/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF6/RF15: a leitura das duas conversas de uma ocorrência, do jeito que a tela as mostra.
 * O autor sai já com o papel (operação, contratante, motorista) — a cor do balão é do participante
 * (T704). Do remetente da contratante sai o endereço **como chegou** (RF16); o casamento com o
 * cadastro de contatos é a T406.
 */
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationDirection,
  OccurrenceConversationMessageStatus,
  OccurrenceConversationParticipant,
  OccurrenceConversationStatus,
} from '../../database/occurrence-conversation.schema.js'

export type OccurrenceConversationMessageAuthor =
  | { readonly kind: 'operation'; readonly name: string | null; readonly userId: string }
  | {
      readonly contactId: string | null
      readonly kind: 'contractor'
      readonly name: string | null
      readonly senderAddress: string | null
      readonly userId: string | null
    }
  | { readonly kind: 'driver'; readonly name: string | null; readonly userId: string }

export type OccurrenceConversationMessageView = {
  readonly author: OccurrenceConversationMessageAuthor
  readonly bodyText: string
  readonly channel: OccurrenceConversationChannel
  readonly createdAt: string
  readonly direction: OccurrenceConversationDirection
  readonly id: string
  readonly status: OccurrenceConversationMessageStatus | null
  readonly statusTimes: Readonly<Record<string, string>>
}

export type OccurrenceConversationView = {
  readonly id: string
  readonly messages: readonly OccurrenceConversationMessageView[]
  readonly participant: OccurrenceConversationParticipant
  readonly status: OccurrenceConversationStatus
  /** RF15: recebidas depois da última que **este** usuário viu. */
  readonly unreadCount: number
}

export type OccurrenceConversationsView = {
  readonly conversations: readonly OccurrenceConversationView[]
}

export type OccurrenceConversationReaderPort = {
  /** `null` quando a ocorrência não existe **na empresa do contexto**. */
  findConversations(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly userId: string
  }): Promise<OccurrenceConversationsView | null>
}

export type OccurrenceConversationReadWriterPort = {
  /** Marca como lida até a última mensagem; `false` quando a conversa não é desta empresa. */
  markRead(params: {
    readonly companyId: string
    readonly conversationId: string
    readonly userId: string
  }): Promise<boolean>
}
