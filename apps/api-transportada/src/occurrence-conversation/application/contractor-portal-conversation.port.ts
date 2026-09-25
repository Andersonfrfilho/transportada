/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T651 (RF21, D9, ADR-0073): as portas da conversa da contratante pelo portal. Toda leitura
 * recebe o `ContractorScope` — só `resolveContractorScope` o produz — e a conversa só é achada quando
 * as quatro condições valem juntas: é a conversa **com a contratante** (nunca a do motorista), de uma
 * contratante do recorte, de ocorrência de nota do recorte, com a tratativa visível ao portal (164 D5).
 */
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationDirection,
  OccurrenceConversationKind,
} from '../../database/occurrence-conversation.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ContractorScope } from '../../contractor-portal/domain/contractor-scope.policy.js'
import type {
  ConversationAttachmentRecord,
  ConversationAttachmentTransactionPort,
} from './conversation-attachment.port.js'

export type PortalConversationMessageRecord = {
  /** Só para saber se foi a própria conta do portal que escreveu; nunca sai na resposta. */
  readonly authorUserId: null | string
  readonly bodyText: string
  readonly channel: OccurrenceConversationChannel
  readonly createdAt: Date
  readonly direction: OccurrenceConversationDirection
  /** Só para achar os anexos; nunca sai na resposta do portal. */
  readonly id: string
}

/** Spec 183 T653: a referência da conversa e as mensagens da transportadora que a conta não leu. */
export type PortalConversationSummary = {
  readonly ref: string
  readonly unreadCount: number
}

export type PortalConversationIdempotencyRecord = {
  readonly fingerprint: string
  readonly response: unknown
}

export type ContractorPortalConversationTransactionPort = {
  /** Spec 183 T702a (RF10): o anexo ligado à mensagem, na mesma transação. */
  readonly attachments: ConversationAttachmentTransactionPort
  /**
   * A referência de cada ocorrência listada cuja contratante (o emitente da nota) está no recorte.
   * A conversa nasce aqui quando ainda não existe (idempotente): a ocorrência chegou ao portal, e a
   * contratante precisa poder escrever primeiro. Junto, as não lidas **desta conta** (T653).
   */
  ensureConversationRefs(input: {
    readonly companyId: string
    readonly newRef: () => string
    readonly occurrenceIds: readonly string[]
    readonly scope: ContractorScope
    readonly userId: string
  }): Promise<ReadonlyMap<string, PortalConversationSummary>>
  /** `null` para referência de outra contratante, inexistente ou de ocorrência ainda não visível. */
  findConversation(input: {
    readonly companyId: string
    readonly ref: string
    readonly scope: ContractorScope
  }): Promise<{
    readonly id: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  } | null>
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<PortalConversationIdempotencyRecord | null>
  insertPortalMessage(input: {
    readonly authorUserId: string
    readonly bodyText: string
    readonly companyId: string
    readonly conversationId: string
    readonly createdAt: Date
  }): Promise<{ readonly createdAt: Date; readonly id: string }>
  listAttachments(input: {
    readonly companyId: string
    readonly messageIds: readonly string[]
  }): Promise<readonly ConversationAttachmentRecord[]>
  listMessages(input: {
    readonly companyId: string
    readonly conversationId: string
  }): Promise<readonly PortalConversationMessageRecord[]>
  /**
   * A lida da conta (RF15) e, junto, as mensagens da transportadora pelo canal `portal` passam a
   * `read` pela política (T654): o portal é o único canal da contratante que sabe "lida" de verdade.
   */
  markRead(input: {
    readonly at: Date
    readonly companyId: string
    readonly conversationId: string
    readonly userId: string
  }): Promise<void>
  saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: unknown
  }): Promise<void>
  /** As mensagens da transportadora depois da última que esta conta do portal leu. */
  unreadCount(input: {
    readonly companyId: string
    readonly conversationId: string
    readonly userId: string
  }): Promise<number>
}

export type ContractorPortalConversationUnitOfWorkPort = {
  execute<TResult>(
    work: (transaction: ContractorPortalConversationTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

export type ContractorPortalScopePort = {
  resolveScope(input: { readonly context: CompanyContext }): Promise<ContractorScope>
}
