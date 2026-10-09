/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b (D4, RF12): o escritório abre a conversa de uma nota ou da viagem com o motorista principal
 * de agora. Idempotente: a segunda abertura devolve a mesma conversa. Abrir também **reabre** a que o
 * escritório encerrou, desde que o assunto continue válido — nota liberada ou viagem terminal é 409.
 */
import type { OfficeSubjectInput } from './office-subject-access.service.js'
import {
  findOfficeSubjectOrFail,
  readOfficeSummary,
  requireWritableRecipient,
} from './office-subject-access.service.js'
import type { OfficeSubjectUnitOfWorkPort } from './office-subject-conversation.port.js'

export function createOpenTripSubjectConversationUseCase(dependencies: {
  readonly unitOfWork: OfficeSubjectUnitOfWorkPort
}) {
  return {
    open: (input: OfficeSubjectInput & { readonly userId: string }) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const subject = await findOfficeSubjectOrFail(transaction, input)
        const driverUserId = await requireWritableRecipient(transaction, input, subject, true)
        const conversation = await transaction.findOrCreateSubjectConversation({
          companyId: input.companyId,
          driverUserId,
          retarget: true,
          subjectId: input.subjectId,
          subjectType: input.subjectType,
          tripId: input.tripId,
        })
        if (subject.conversation?.storedStatus === 'closed') {
          await transaction.setStoredStatus({
            companyId: input.companyId,
            conversationId: conversation.id,
            status: 'open',
          })
        }
        return {
          created: conversation.created,
          summary: await readOfficeSummary(transaction, input, conversation.id),
        }
      }),
  }
}
