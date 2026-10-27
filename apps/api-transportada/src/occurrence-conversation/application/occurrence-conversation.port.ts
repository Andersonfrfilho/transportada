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
  OccurrenceConversationAnyParticipant,
  OccurrenceConversationStatus,
} from '../../database/occurrence-conversation.schema.js'

import type {
  ClientChannelView,
  ClientDeliveryActorKind,
} from '../domain/client-conversation.policy.js'

import type { OccurrenceConversationSystemNoticeView } from '../domain/occurrence-conversation-system-notice.policy.js'
import type { ContractorSenderIdentity } from '../domain/contractor-sender.policy.js'
import type { ConversationAttachmentRecord } from './conversation-attachment.port.js'
import type { SubjectAttachmentView } from './conversation-transcription.port.js'

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
  /** Spec 283 (RF3): quem respondeu na conversa do cliente — só o número, mascarado. */
  | { readonly addressMasked: string; readonly kind: 'client' }

/** Spec 283 (RF1): o envio que a mensagem da conversa do cliente conta. */
export type ClientDeliveryView = {
  readonly actorKind: ClientDeliveryActorKind
  /** O nome do perfil de quem enviou; `null` no Sistema. */
  readonly actorName: null | string
  readonly deliveryId: string
  /** O arquivo enviado (o boleto); `null` quando o anexo não está mais lá. */
  readonly documentName: null | string
  readonly recipientMasked: string
}

export type OccurrenceConversationMessageView = {
  /**
   * Spec 183 T702a (RF10): os anexos da mensagem, com a URL temporária de leitura. O áudio traz `durationMs` e
   * `transcription` (264) quando houver.
   */
  readonly attachments: readonly SubjectAttachmentView[]
  readonly author: OccurrenceConversationMessageAuthor
  readonly bodyText: string
  readonly channel: OccurrenceConversationChannel
  /** Spec 283: presente só na mensagem enviada da conversa do cliente. */
  readonly clientDelivery?: ClientDeliveryView
  /**
   * Spec 267 RF8: quem foi em cópia no e-mail de saída — nome (do perfil, quando acha) e e-mail mascarado; o endereço
   * real nunca sai. Ausente na mensagem sem cópia.
   */
  readonly copy?: readonly { readonly maskedEmail: string; readonly name: null | string }[]
  readonly createdAt: string
  readonly direction: OccurrenceConversationDirection
  /**
   * O e-mail recebido inteiro, com o histórico citado que o `bodyText` deixa de fora: o painel o mostra recolhido.
   * Ausente quando a mensagem não veio por e-mail ou quando o texto inteiro é o próprio `bodyText`.
   */
  readonly emailFullText?: string
  readonly id: string
  readonly status: OccurrenceConversationMessageStatus | null
  readonly statusTimes: Readonly<Record<string, string>>
  /** Spec 279 T6b (RF12): presente só na mensagem do sistema — "Boleto enviado para o e-mail: …". */
  readonly systemNotice?: OccurrenceConversationSystemNoticeView
}

export type OccurrenceClientView = {
  /** D4: a faixa "Canais abertos". */
  readonly channels: readonly ClientChannelView[]
  /** O nome do cadastro do cliente; `null` quando o cadastro não tem. */
  readonly name: null | string
  readonly taxIdMasked: string
}

export type OccurrenceConversationView = {
  /** Spec 283: presente só na conversa do cliente. */
  readonly client?: OccurrenceClientView
  readonly id: string
  readonly messages: readonly OccurrenceConversationMessageView[]
  readonly participant: OccurrenceConversationAnyParticipant
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
    /** Spec 283 RF7: a conversa do cliente só para quem pode enviar ao cliente (`occurrences.resolve`). */
    readonly includeClient?: boolean
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
