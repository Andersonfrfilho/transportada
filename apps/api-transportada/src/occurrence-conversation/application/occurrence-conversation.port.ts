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

import type { ContractorSenderIdentity } from '../domain/contractor-sender.policy.js'
import type {
  ConversationAttachmentRecord,
  ConversationAttachmentView,
} from './conversation-attachment.port.js'

export type OccurrenceConversationMessageAuthor =
  /** Spec 183 T802: o aviso que o tipo da ocorrência mandou sozinho — sem autor humano. */
  | { readonly kind: 'automatic' }
  | { readonly kind: 'operation'; readonly name: string | null; readonly userId: string }
  | {
      /**
       * RF16: quem respondeu, casado com os contatos da contratante na leitura. `null` quando a
       * mensagem veio pelo portal, onde o autor é o usuário da contratante (`userId`).
       */
      readonly identity: ContractorSenderIdentity | null
      readonly kind: 'contractor'
      readonly userId: string | null
    }
  | { readonly kind: 'driver'; readonly name: string | null; readonly userId: string }

export type OccurrenceConversationMessageView = {
  /** Spec 183 T702a (RF10): os anexos da mensagem, com a URL temporária de leitura. */
  readonly attachments: readonly ConversationAttachmentView[]
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
  /**
   * Spec 183 T654 (RF21): o canal Portal está aberto quando o portal mostra a ocorrência à
   * contratante e alguém dela tem conta — senão a mensagem ficaria sem leitor.
   */
  readonly contractorPortal: { readonly available: boolean }
  readonly conversations: readonly OccurrenceConversationView[]
}

export type OccurrenceConversationReaderPort = {
  /** `null` quando a ocorrência não existe **na empresa do contexto**. */
  findConversations(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly userId: string
  }): Promise<OccurrenceConversationsView | null>
  /** Spec 183 T702a: os anexos das mensagens lidas, pela empresa do contexto. */
  findAttachments(params: {
    readonly companyId: string
    readonly messageIds: readonly string[]
  }): Promise<readonly ConversationAttachmentRecord[]>
}

export type OccurrenceConversationReadWriterPort = {
  /** Marca como lida até a última mensagem; `false` quando a conversa não é desta empresa. */
  markRead(params: {
    readonly companyId: string
    readonly conversationId: string
    readonly userId: string
  }): Promise<boolean>
}
