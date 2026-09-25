/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11): as portas da conversa com o motorista pelo app. O motorista da conversa é o
 * **usuário** (vínculo ativo) do primeiro condutor da viagem da ocorrência; o motorista que lê pelo
 * `/me` é conferido pela ficha da frota dele na tripulação da viagem.
 */
import type {
  ConversationAttachmentRecord,
  ConversationAttachmentTransactionPort,
} from './conversation-attachment.port.js'
import type {
  OccurrenceConversationKind,
  OccurrenceConversationMessageStatus,
} from '../../database/occurrence-conversation.schema.js'

export type DriverConversationMessageRecord = {
  /** O nome de quem escreveu da operação; `null` na mensagem do próprio motorista. */
  readonly authorName: null | string
  readonly bodyText: string
  readonly createdAt: Date
  readonly direction: 'inbound' | 'outbound'
  readonly id: string
  readonly status: null | OccurrenceConversationMessageStatus
}

export type DriverConversationIdempotencyRecord = {
  readonly fingerprint: string
  readonly response: unknown
}

export type DriverConversationSummaryRecord = {
  readonly lastMessageAt: Date
  readonly occurrenceId: string
  readonly occurrenceLabel: string
  /** Mensagens da operação que o motorista ainda não abriu. */
  readonly unreadCount: number
}

export type DriverConversationTransactionPort = {
  /** Spec 183 T702a (RF10): o anexo ligado à mensagem, na mesma transação. */
  readonly attachments: ConversationAttachmentTransactionPort
  /** Os anexos das mensagens lidas, antes de assinar a URL. */
  listAttachments(input: {
    readonly companyId: string
    readonly messageIds: readonly string[]
  }): Promise<readonly ConversationAttachmentRecord[]>
  /**
   * Spec 183 T604 (RF14): aplica o status do app (entregue ao baixar, lida ao abrir) às mensagens da
   * operação nas conversas deste motorista — só nesta ocorrência, ou em todas com `null` — pela
   * política, travando as linhas.
   */
  applyDriverStatus(input: {
    readonly at: Date
    readonly companyId: string
    readonly driverUserId: string
    readonly incoming: 'delivered' | 'read'
    readonly occurrenceId: null | string
  }): Promise<void>
  /** As conversas deste motorista na empresa, da mais recente para a mais antiga. */
  listMyConversations(input: {
    readonly companyId: string
    readonly driverUserId: string
  }): Promise<readonly DriverConversationSummaryRecord[]>
  /** A ocorrência na empresa e o usuário do motorista da viagem; `null` na ocorrência alheia. */
  findDriverTarget(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | {
    readonly driverUserId: null | string
    readonly occurrenceKind: OccurrenceConversationKind
    readonly occurrenceLabel: string
  }>
  /** A ocorrência só se a viagem dela tem esta ficha de motorista na tripulação. */
  findMyOccurrence(input: {
    readonly companyId: string
    readonly driverId: string
    readonly occurrenceId: string
  }): Promise<null | { readonly occurrenceKind: OccurrenceConversationKind }>
  /** Com trava consultiva pela operação e pela chave, como no e-mail (T403). */
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<DriverConversationIdempotencyRecord | null>
  saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: unknown
  }): Promise<void>
  findOrCreateDriverConversation(input: {
    readonly companyId: string
    readonly driverUserId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  }): Promise<{ readonly id: string }>
  insertMessage(input: {
    readonly authorUserId: null | string
    readonly bodyText: string
    readonly companyId: string
    readonly conversationId: string
    readonly createdAt: Date
    readonly direction: 'inbound' | 'outbound'
    readonly driverUserId: null | string
    readonly idempotencyKey: string
    readonly status: null | OccurrenceConversationMessageStatus
    readonly statusTimes: Readonly<Record<string, string>>
  }): Promise<{ readonly id: string }>
  listDriverMessages(input: {
    readonly companyId: string
    readonly driverUserId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  }): Promise<readonly DriverConversationMessageRecord[]>
}

export type DriverConversationUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: DriverConversationTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

/** RF11: o aviso na caixa do motorista. Sem corpo — o texto fica na conversa, atrás do login. */
export type DriverConversationNotifierPort = {
  notify(input: {
    readonly companyId: string
    readonly dedupeKey: string
    readonly occurrenceLabel: string
    readonly recipientUserId: string
  }): Promise<void>
}
