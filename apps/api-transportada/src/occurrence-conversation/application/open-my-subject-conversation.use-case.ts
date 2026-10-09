/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (D4): o motorista abre a conversa de uma nota ou da viagem dele — nunca a de ocorrência,
 * que nasce do registro. Idempotente: a segunda abertura devolve a mesma conversa. Em conversa
 * encerrada não abre; se ele é o principal agora, a conversa passa a ele.
 */
import { ApiError } from '../../shared/api.error.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import {
  OPENABLE_SUBJECT_TYPES,
  type OpenableSubjectType,
} from '../domain/driver-subject-conversation.constant.js'
import { resolveEffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import {
  ConversationClosedError,
  OccurrenceConversationDriverChangedError,
} from '../domain/occurrence-conversation.error.js'
import type { DriverSubjectUnitOfWorkPort } from './driver-conversation-subject.port.js'
import { findMySubjectOrFail, isSubjectReachable } from './driver-subject-access.service.js'
import { toSubjectConversationSummary } from './driver-subject-conversation.types.js'

function isOpenable(subjectType: string): subjectType is OpenableSubjectType {
  return OPENABLE_SUBJECT_TYPES.some((openable) => openable === subjectType)
}

export function createOpenMySubjectConversationUseCase(dependencies: {
  readonly unitOfWork: DriverSubjectUnitOfWorkPort
}) {
  return {
    open: (input: {
      readonly companyId: string
      readonly driverId: string
      readonly driverUserId: string
      readonly subjectId: string
      readonly subjectType: OpenableSubjectType
    }) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        if (!isOpenable(input.subjectType)) throw new ApiError(HTTP_ERROR.invalidRequest)
        const subject = await findMySubjectOrFail(transaction, input)
        const status = resolveEffectiveConversationStatus({
          documentReleasedAt: subject.documentReleasedAt,
          storedStatus: subject.conversation?.storedStatus ?? 'open',
          subjectType: subject.subjectType,
          tripStatus: subject.tripStatus,
        })
        if (status === 'closed') throw new ConversationClosedError()
        if (!isSubjectReachable(subject, input.driverUserId)) {
          throw new OccurrenceConversationDriverChangedError()
        }
        const conversation = await transaction.findOrCreateSubjectConversation({
          companyId: input.companyId,
          driverUserId: input.driverUserId,
          retarget: subject.isPrincipal,
          subjectId: input.subjectId,
          subjectType: input.subjectType,
          tripId: subject.tripId,
        })
        const page = await transaction.listMySubjects({
          companyId: input.companyId,
          conversationId: conversation.id,
          cursor: null,
          driverId: input.driverId,
          driverUserId: input.driverUserId,
          limit: 1,
        })
        const row = page.rows[0]
        if (row === undefined) throw new Error('subject conversation was not readable after open')
        return { created: conversation.created, summary: toSubjectConversationSummary(row) }
      }),
  }
}
