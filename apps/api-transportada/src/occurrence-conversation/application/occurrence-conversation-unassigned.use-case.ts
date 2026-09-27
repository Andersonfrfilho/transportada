/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505 (RF9): ler a fila e atribuir. Atribuir grava a mensagem na conversa escolhida com o
 * horário em que ela **chegou** (a conversa fica em ordem), e marca quem e quando — uma vez só, e só
 * entre as candidatas.
 */
import {
  OccurrenceConversationAlreadyAssignedError,
  OccurrenceConversationAssignmentInvalidError,
  OccurrenceConversationUnassignedNotFoundError,
} from '../domain/occurrence-conversation.error.js'
import type {
  UnassignedAssignmentUnitOfWorkPort,
  UnassignedMessageView,
  UnassignedReaderPort,
} from './occurrence-conversation-unassigned.port.js'

export type ListUnassignedMessagesUseCase = Readonly<{
  list: (input: { readonly companyId: string }) => Promise<readonly UnassignedMessageView[]>
}>

export type AssignUnassignedMessageUseCase = Readonly<{
  assign: (input: {
    readonly companyId: string
    readonly conversationId: string
    readonly unassignedId: string
    readonly userId: string
  }) => Promise<{ readonly conversationId: string; readonly messageId: string }>
}>

export function createListUnassignedMessagesUseCase(dependencies: {
  readonly reader: UnassignedReaderPort
}): ListUnassignedMessagesUseCase {
  return { list: (input) => dependencies.reader.listPending(input) }
}

export function createAssignUnassignedMessageUseCase(dependencies: {
  readonly clock: () => Date
  readonly unitOfWork: UnassignedAssignmentUnitOfWorkPort
}): AssignUnassignedMessageUseCase {
  return {
    assign: (input) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const record = await transaction.lockUnassigned({
          companyId: input.companyId,
          unassignedId: input.unassignedId,
        })
        if (record === null) throw new OccurrenceConversationUnassignedNotFoundError()
        if (record.assignedAt !== null) throw new OccurrenceConversationAlreadyAssignedError()
        if (!record.candidateConversationIds.includes(input.conversationId)) {
          throw new OccurrenceConversationAssignmentInvalidError()
        }

        const message = await transaction.insertConversationMessage({
          bodyText: record.bodyText,
          channel: record.channel,
          companyId: input.companyId,
          conversationId: input.conversationId,
          createdAt: record.receivedAt,
          mailMessageId: record.mailMessageId,
          providerMessageId: record.providerMessageId,
          senderAddress: record.senderAddress,
        })
        await transaction.markAssigned({
          assignedAt: dependencies.clock(),
          companyId: input.companyId,
          messageId: message.id,
          unassignedId: input.unassignedId,
          userId: input.userId,
        })
        return { conversationId: input.conversationId, messageId: message.id }
      }),
  }
}
