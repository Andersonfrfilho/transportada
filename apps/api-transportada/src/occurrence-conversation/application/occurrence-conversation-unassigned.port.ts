/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505 (RF9): a fila das mensagens sem conversa certa. As candidatas são as conversas
 * abertas da contratante daquele remetente — calculadas pelo servidor, dentro da empresa, e
 * conferidas de novo na atribuição.
 */
import type { OccurrenceConversationUnassignedChannel } from '../../database/occurrence-conversation.schema.js'

export type UnassignedCandidateView = {
  readonly contractorName: string
  readonly conversationId: string
  readonly occurrenceId: string
  readonly occurrenceKind: 'document' | 'stop'
  /** A última mensagem que a operação mandou nesta conversa: ajuda a escolher, sem abrir. */
  readonly lastOutbound: null | { readonly at: string; readonly preview: string }
}

export type UnassignedMessageView = {
  readonly bodyText: string
  readonly candidates: readonly UnassignedCandidateView[]
  readonly channel: OccurrenceConversationUnassignedChannel
  readonly contact: null | { readonly contactId: string; readonly name: string }
  readonly id: string
  readonly receivedAt: string
  readonly senderAddress: string
}

export type UnassignedReaderPort = {
  listPending(input: { readonly companyId: string }): Promise<readonly UnassignedMessageView[]>
}

export type UnassignedMessageRecord = {
  readonly assignedAt: Date | null
  readonly bodyText: string
  readonly candidateConversationIds: readonly string[]
  readonly channel: OccurrenceConversationUnassignedChannel
  readonly id: string
  readonly mailMessageId: null | string
  readonly providerMessageId: null | string
  readonly receivedAt: Date
  readonly senderAddress: string
}

export type UnassignedAssignmentTransactionPort = {
  /** `FOR UPDATE` na linha da fila: duas atribuições ao mesmo tempo não gravam duas mensagens. */
  lockUnassigned(input: {
    readonly companyId: string
    readonly unassignedId: string
  }): Promise<null | UnassignedMessageRecord>
  insertConversationMessage(input: {
    readonly bodyText: string
    readonly channel: OccurrenceConversationUnassignedChannel
    readonly companyId: string
    readonly conversationId: string
    readonly createdAt: Date
    readonly mailMessageId: null | string
    readonly providerMessageId: null | string
    readonly senderAddress: string
  }): Promise<{ readonly id: string }>
  markAssigned(input: {
    readonly assignedAt: Date
    readonly companyId: string
    readonly messageId: string
    readonly unassignedId: string
    readonly userId: string
  }): Promise<void>
}

export type UnassignedAssignmentUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: UnassignedAssignmentTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
