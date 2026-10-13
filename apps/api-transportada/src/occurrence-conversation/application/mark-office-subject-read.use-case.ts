/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b (RF15): o escritório abre a conversa de um assunto — marca lidas, por usuário, as
 * mensagens do motorista. Registro do usuário: nada volta ao motorista. Conversa encerrada também se lê.
 */
import type { OfficeSubjectInput } from './office-subject-access.service.js'
import { findOfficeSubjectOrFail } from './office-subject-access.service.js'
import type { OfficeSubjectUnitOfWorkPort } from './office-subject-conversation.port.js'

export function createMarkOfficeSubjectReadUseCase(dependencies: {
  readonly unitOfWork: OfficeSubjectUnitOfWorkPort
}) {
  return {
    markRead: (input: OfficeSubjectInput & { readonly userId: string }): Promise<void> =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const subject = await findOfficeSubjectOrFail(transaction, input)
        if (subject.conversation === null) return
        await transaction.markConversationRead({
          companyId: input.companyId,
          conversationId: subject.conversation.id,
          userId: input.userId,
        })
      }),
  }
}
