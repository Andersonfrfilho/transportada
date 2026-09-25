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
} from '../../database/occurrence-conversation.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ContractorScope } from '../../contractor-portal/domain/contractor-scope.policy.js'

export type PortalConversationMessageRecord = {
  /** Só para saber se foi a própria conta do portal que escreveu; nunca sai na resposta. */
  readonly authorUserId: null | string
  readonly bodyText: string
  readonly channel: OccurrenceConversationChannel
  readonly createdAt: Date
  readonly direction: OccurrenceConversationDirection
}

export type PortalConversationIdempotencyRecord = {
  readonly fingerprint: string
  readonly response: unknown
}

export type ContractorPortalConversationTransactionPort = {
  /**
   * A referência de cada ocorrência listada cuja contratante (o emitente da nota) está no recorte.
   * A conversa nasce aqui quando ainda não existe (idempotente): a ocorrência chegou ao portal, e a
   * contratante precisa poder escrever primeiro.
   */
  ensureConversationRefs(input: {
    readonly companyId: string
    readonly newRef: () => string
    readonly occurrenceIds: readonly string[]
    readonly scope: ContractorScope
  }): Promise<ReadonlyMap<string, string>>
  /** `null` para referência de outra contratante, inexistente ou de ocorrência ainda não visível. */
  findConversation(input: {
    readonly companyId: string
    readonly ref: string
    readonly scope: ContractorScope
  }): Promise<{ readonly id: string } | null>
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
  }): Promise<{ readonly createdAt: Date }>
  listMessages(input: {
    readonly companyId: string
    readonly conversationId: string
  }): Promise<readonly PortalConversationMessageRecord[]>
  markRead(input: {
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
