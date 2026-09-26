/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T654 (RF21, D9): as portas do envio da operação à contratante pelo canal Portal. O
 * portal só mostra a conversa quando a ocorrência chegou lá (164 D5) e só a quem tem conta ligada à
 * contratante; o público é decidido do lado da 164 e chega aqui pronto.
 */
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import type { ConversationAttachmentTransactionPort } from './conversation-attachment.port.js'

/** Quem lê pelo portal: a contratante da conversa e as contas do portal ligadas a ela. */
export type ContractorPortalAudience = {
  readonly contractorId: string
  readonly occurrenceKind: OccurrenceConversationKind
  /** Como a ocorrência se chama no aviso: a nota, nunca PII. */
  readonly occurrenceLabel: string
  readonly userIds: readonly string[]
}

export type ContractorPortalMessageTransactionPort = {
  /** Spec 183 T702a (RF10): o anexo ligado à mensagem, na mesma transação. */
  readonly attachments: ConversationAttachmentTransactionPort
  /**
   * `not_found` é a ocorrência que não existe na empresa; `unavailable` é a que existe, mas o
   * portal não mostra (tratativa ainda interna, nota sem contratante casada ou ninguém com conta).
   */
  findAudience(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<
    | { readonly kind: 'available'; readonly audience: ContractorPortalAudience }
    | { readonly kind: 'not_found' }
    | { readonly kind: 'unavailable' }
  >
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{ readonly fingerprint: string; readonly response: unknown } | null>
  /**
   * Spec 183 T702d: liga à mensagem da contratante os anexos da conversa do **motorista** da mesma
   * ocorrência, pelo mesmo objeto (nenhum byte copiado). Devolve quantos ligou; anexo de outra
   * conversa, de outra ocorrência ou de outra empresa não entra na conta.
   */
  forwardDriverAttachments(input: {
    readonly attachmentIds: readonly string[]
    readonly companyId: string
    readonly messageId: string
    readonly occurrenceId: string
  }): Promise<number>
  findOrCreateContractorConversation(input: {
    readonly companyId: string
    readonly contractorId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
    readonly publicRef: string
  }): Promise<{ readonly id: string }>
  insertPortalMessage(input: {
    readonly actorUserId: string
    readonly bodyText: string
    readonly companyId: string
    readonly conversationId: string
    readonly createdAt: Date
  }): Promise<{ readonly id: string }>
  saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: unknown
  }): Promise<void>
}

export type ContractorPortalMessageUnitOfWorkPort = {
  execute<TResult>(
    work: (transaction: ContractorPortalMessageTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

/** O aviso por e-mail às contas do portal: que há mensagem nova, **sem** o corpo (RF21). */
export type ContractorPortalNotifierPort = {
  notify(input: {
    readonly companyId: string
    readonly messageId: string
    readonly occurrenceLabel: string
    readonly recipientUserIds: readonly string[]
  }): Promise<void>
}
