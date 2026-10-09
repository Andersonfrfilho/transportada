/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b (ADR-0101 §4): o escritório encerra a conversa de uma nota ou da viagem. Idempotente:
 * encerrar a encerrada devolve o mesmo resumo. Sem conversa não há o que encerrar (404); a ocorrência
 * nunca encerra — o tipo do assunto nem chega aqui.
 */
import { ConversationNotFoundError } from '../domain/occurrence-conversation.error.js'
import type { OfficeSubjectInput } from './office-subject-access.service.js'
import { findOfficeSubjectOrFail, readOfficeSummary } from './office-subject-access.service.js'
import type { OfficeSubjectUnitOfWorkPort } from './office-subject-conversation.port.js'

export function createCloseTripSubjectConversationUseCase(dependencies: {
  readonly unitOfWork: OfficeSubjectUnitOfWorkPort
}) {
  return {
    close: (input: OfficeSubjectInput & { readonly userId: string }) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const subject = await findOfficeSubjectOrFail(transaction, input)
        if (subject.conversation === null) throw new ConversationNotFoundError()
        if (subject.conversation.storedStatus !== 'closed') {
          await transaction.setStoredStatus({
            companyId: input.companyId,
            conversationId: subject.conversation.id,
            status: 'closed',
          })
        }
        return readOfficeSummary(transaction, input, subject.conversation.id)
      }),
  }
}
