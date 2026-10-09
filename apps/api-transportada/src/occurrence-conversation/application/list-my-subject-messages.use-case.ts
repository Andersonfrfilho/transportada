/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (RF8): as mensagens da conversa de um assunto, em ordem crescente, por página para trás
 * (`before`). Assunto da tripulação sem conversa devolve lista vazia; o que não é alcançável é 404. Baixar
 * é entregar (RF14), como na rota antiga.
 */
import {
  DRIVER_SUBJECT_MESSAGES_DEFAULT_LIMIT,
  DRIVER_SUBJECT_MESSAGES_MAX_LIMIT,
} from '../domain/driver-subject-conversation.constant.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import { signConversationAttachments } from './conversation-attachment.service.js'
import type { DriverSubjectUnitOfWorkPort } from './driver-conversation-subject.port.js'
import { deriveOwnMessageStatus } from '../domain/driver-own-message-status.policy.js'
import { findReachableSubjectOrFail } from './driver-subject-access.service.js'
import type { MySubjectInput } from './driver-subject-access.service.js'
import type { DriverSubjectMessage } from './driver-subject-conversation.types.js'

export function createListMySubjectMessagesUseCase(dependencies: {
  readonly clock: () => Date
  readonly storage: Pick<ConversationAttachmentStoragePort, 'createSignedDownload'>
  readonly unitOfWork: DriverSubjectUnitOfWorkPort
}) {
  return {
    list: (
      input: MySubjectInput & { readonly before?: string; readonly limit?: number },
    ): Promise<readonly DriverSubjectMessage[]> =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const subject = await findReachableSubjectOrFail(transaction, input)
        if (subject.conversation === null) return []
        await transaction.applySubjectStatus({
          at: dependencies.clock(),
          companyId: input.companyId,
          conversationIds: [subject.conversation.id],
          incoming: 'delivered',
        })
        const messages = await transaction.listSubjectMessages({
          before: input.before ?? null,
          companyId: input.companyId,
          conversationId: subject.conversation.id,
          limit: Math.min(
            input.limit ?? DRIVER_SUBJECT_MESSAGES_DEFAULT_LIMIT,
            DRIVER_SUBJECT_MESSAGES_MAX_LIMIT,
          ),
        })
        const attachments = await signConversationAttachments(
          dependencies.storage,
          await transaction.listAttachments({
            companyId: input.companyId,
            messageIds: messages.map((message) => message.id),
          }),
        )
        const officeReadHorizon = await transaction.readOfficeReadHorizon({
          companyId: input.companyId,
          conversationId: subject.conversation.id,
          driverUserId: subject.conversation.driverUserId,
        })
        return messages.map((message) => ({
          ...message,
          attachments: attachments.get(message.id) ?? [],
          createdAt: message.createdAt.toISOString(),
          status: deriveOwnMessageStatus(message, officeReadHorizon),
        }))
      }),
  }
}
