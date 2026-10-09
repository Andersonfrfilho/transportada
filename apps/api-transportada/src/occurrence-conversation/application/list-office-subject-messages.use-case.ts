/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b: as mensagens da conversa de um assunto, em ordem crescente, por página para trás
 * (`before`). Assunto da viagem sem conversa devolve lista vazia; o que não é da viagem é 404. Ler não
 * mexe no status de entrega — ele é do aparelho do motorista.
 */
import {
  OFFICE_SUBJECT_MESSAGES_DEFAULT_LIMIT,
  OFFICE_SUBJECT_MESSAGES_MAX_LIMIT,
} from '../domain/office-subject-conversation.constant.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import { signConversationAttachments } from './conversation-attachment.service.js'
import type { OfficeSubjectInput } from './office-subject-access.service.js'
import { findOfficeSubjectOrFail } from './office-subject-access.service.js'
import type { OfficeSubjectUnitOfWorkPort } from './office-subject-conversation.port.js'
import type { OfficeSubjectMessage } from './office-subject-conversation.types.js'

export function createListOfficeSubjectMessagesUseCase(dependencies: {
  readonly storage: Pick<ConversationAttachmentStoragePort, 'createSignedDownload'>
  readonly unitOfWork: OfficeSubjectUnitOfWorkPort
}) {
  return {
    list: (
      input: OfficeSubjectInput & { readonly before?: string; readonly limit?: number },
    ): Promise<readonly OfficeSubjectMessage[]> =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const subject = await findOfficeSubjectOrFail(transaction, input)
        if (subject.conversation === null) return []
        const messages = await transaction.listOfficeMessages({
          before: input.before ?? null,
          companyId: input.companyId,
          conversationId: subject.conversation.id,
          limit: Math.min(
            input.limit ?? OFFICE_SUBJECT_MESSAGES_DEFAULT_LIMIT,
            OFFICE_SUBJECT_MESSAGES_MAX_LIMIT,
          ),
        })
        const attachments = await signConversationAttachments(
          dependencies.storage,
          await transaction.listAttachments({
            companyId: input.companyId,
            messageIds: messages.map((message) => message.id),
          }),
        )
        return messages.map((message) => ({
          ...message,
          attachments: attachments.get(message.id) ?? [],
          createdAt: message.createdAt.toISOString(),
        }))
      }),
  }
}
