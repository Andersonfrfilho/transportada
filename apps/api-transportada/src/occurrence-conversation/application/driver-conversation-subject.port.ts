/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (ADR-0101): as portas da conversa por assunto no `/me` do motorista — lista, abrir,
 * mensagens e leitura. O motorista é a ficha da frota (tripulação) mais o usuário do vínculo; a
 * visibilidade de nota e de viagem é a do ADR §3 (destinatário ou principal). Só leitura de dados do
 * assunto: a conversa não decide nada da tratativa, da taxa nem do acerto.
 */
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationKind,
  OccurrenceConversationMessageStatus,
} from '../../database/occurrence-conversation.schema.js'
import type { TripStatus } from '../../database/trip.schema.js'
import type { KeysetCursor } from '../../shared/keyset-cursor.support.js'
import type { OccurrenceConversationSubjectType } from '../../shared/occurrence-conversation-subject.constant.js'
import type { EffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import type { SubjectLabelFacts } from '../domain/conversation-subject-label.policy.js'
import type { OpenableSubjectType } from '../domain/driver-subject-conversation.constant.js'
import type { ConversationAttachmentRecord } from './conversation-attachment.port.js'

export type SubjectConversationRow = {
  /** Canais como o banco os tem; a política ordena e descarta o desconhecido. */
  readonly channels: readonly string[]
  readonly conversationId: string
  readonly documentReleasedAt: Date | null
  readonly iconName: null | string
  readonly labelFacts: SubjectLabelFacts
  readonly lastMessageAt: Date | null
  readonly lastMessageDirection: 'inbound' | 'outbound' | null
  readonly lastMessagePreview: null | string
  readonly protocol: string
  /** A chave da ordem da lista: a última mensagem, ou a criação da conversa. */
  readonly sortAt: Date
  readonly storedStatus: EffectiveConversationStatus
  readonly subjectId: string
  readonly subjectType: OccurrenceConversationSubjectType
  readonly tripId: null | string
  readonly tripStatus: TripStatus | null
  readonly unreadCount: number
}

export type MyConversationSubject = {
  readonly conversation: null | {
    readonly driverUserId: string
    readonly id: string
    readonly storedStatus: EffectiveConversationStatus
  }
  readonly documentReleasedAt: Date | null
  /** O motorista principal da viagem agora (posição 1 da tripulação). */
  readonly isPrincipal: boolean
  readonly occurrenceKind: OccurrenceConversationKind | null
  readonly subjectId: string
  readonly subjectType: OccurrenceConversationSubjectType
  readonly tripId: string
  readonly tripStatus: TripStatus | null
}

export type SubjectMessageRecord = {
  readonly authorName: null | string
  readonly bodyText: string
  readonly channel: OccurrenceConversationChannel
  readonly clientMessageId: null | string
  readonly createdAt: Date
  readonly direction: 'inbound' | 'outbound'
  readonly id: string
  readonly status: null | OccurrenceConversationMessageStatus
}

type DriverIdentity = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
}

export type DriverSubjectTransactionPort = {
  /**
   * RF14: o app baixou (`delivered`) ou abriu (`read`) — aplica a política de status às mensagens da
   * operação nestas conversas, travando as linhas, numa leitura e numa escrita só.
   */
  applySubjectStatus(input: {
    readonly at: Date
    readonly companyId: string
    readonly conversationIds: readonly string[]
    readonly incoming: 'delivered' | 'read'
  }): Promise<void>
  /** O assunto e a conversa dele pela ótica do motorista; `null` fora da tripulação ou da empresa. */
  findMySubject(
    input: DriverIdentity & {
      readonly subjectId: string
      readonly subjectType: OccurrenceConversationSubjectType
    },
  ): Promise<MyConversationSubject | null>
  /**
   * Find-or-create idempotente da conversa de nota ou de viagem. Com `retarget`, a que já existe passa ao
   * motorista (ele é o principal agora). O protocolo vem do trigger do banco.
   */
  findOrCreateSubjectConversation(input: {
    readonly companyId: string
    readonly driverUserId: string
    readonly retarget: boolean
    readonly subjectId: string
    readonly subjectType: OpenableSubjectType
    readonly tripId: string
  }): Promise<{ readonly created: boolean; readonly id: string }>
  listAttachments(input: {
    readonly companyId: string
    readonly messageIds: readonly string[]
  }): Promise<readonly ConversationAttachmentRecord[]>
  /** A página da lista (no máximo `limit`) e se há mais; `conversationId` restringe a uma conversa. */
  listMySubjects(
    input: DriverIdentity & {
      readonly conversationId?: string
      readonly cursor: KeysetCursor | null
      readonly limit: number
    },
  ): Promise<{ readonly hasMore: boolean; readonly rows: readonly SubjectConversationRow[] }>
  /**
   * Spec 260 (T5.4): até onde um usuário do ESCRITÓRIO (diferente do motorista da conversa) já leu — o
   * `created_at` da mensagem mais nova marcada como lida por algum deles; `null` se ninguém leu. Uma consulta.
   */
  readOfficeReadHorizon(input: {
    readonly companyId: string
    readonly conversationId: string
    readonly driverUserId: string
  }): Promise<Date | null>
  /** Em ordem crescente; `before` é o id da mensagem mais antiga que o app já tem. */
  listSubjectMessages(input: {
    readonly before: null | string
    readonly companyId: string
    readonly conversationId: string
    readonly limit: number
  }): Promise<readonly SubjectMessageRecord[]>
}

export type DriverSubjectUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: DriverSubjectTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
