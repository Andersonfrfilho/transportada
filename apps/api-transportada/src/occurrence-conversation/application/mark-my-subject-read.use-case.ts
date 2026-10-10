/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4 (RF14): abrir a conversa de um assunto é ler as mensagens da operação daquele assunto —
 * só dele, nunca das outras conversas do motorista. Conversa encerrada também se lê.
 */
import type { DriverSubjectUnitOfWorkPort } from './driver-conversation-subject.port.js'
import { findReachableSubjectOrFail } from './driver-subject-access.service.js'
import type { MySubjectInput } from './driver-subject-access.service.js'

export function createMarkMySubjectReadUseCase(dependencies: {
  readonly clock: () => Date
  readonly unitOfWork: DriverSubjectUnitOfWorkPort
}) {
  return {
    markRead: (input: MySubjectInput): Promise<void> =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const subject = await findReachableSubjectOrFail(transaction, input)
        if (subject.conversation === null) return
        await transaction.applySubjectStatus({
          at: dependencies.clock(),
          companyId: input.companyId,
          conversationIds: [subject.conversation.id],
          incoming: 'read',
        })
      }),
  }
}
