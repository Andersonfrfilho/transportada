/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4: as peças puras da resposta do motorista por assunto — os campos da impressão digital
 * (os da rota antiga na ocorrência) e o alvo do anexo (antigo na ocorrência, `conversation_id` no resto).
 */
import {
  OCCURRENCE_CONVERSATION_SUBJECT,
  type OccurrenceConversationSubjectType,
} from '../../shared/occurrence-conversation-subject.constant.js'
import type { ConversationUploadTarget } from './conversation-attachment.port.js'
import type { MyConversationSubject } from './driver-conversation-subject.port.js'
import type { ReplyMySubjectInput } from './reply-my-subject-conversation.use-case.js'

export function isOccurrenceSubject(subjectType: OccurrenceConversationSubjectType): boolean {
  return subjectType === OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE
}

/** Os mesmos campos da rota antiga na ocorrência; nota e viagem somam o tipo, que o id sozinho não diz. */
export function buildFingerprintFields(
  input: ReplyMySubjectInput,
  bodyText: string,
): readonly string[] {
  const attachments = (input.attachmentIds ?? []).join(',')
  if (isOccurrenceSubject(input.subjectType)) {
    return [input.companyId, input.subjectId, input.driverUserId, bodyText, attachments]
  }
  return [
    input.companyId,
    input.subjectType,
    input.subjectId,
    input.driverUserId,
    bodyText,
    attachments,
  ]
}

export function buildUploadTarget(
  input: ReplyMySubjectInput,
  subject: MyConversationSubject,
  conversationId: string,
): ConversationUploadTarget {
  const base = {
    channel: 'app',
    companyId: input.companyId,
    participant: 'driver',
    requestedByUserId: input.driverUserId,
  } as const
  if (subject.occurrenceKind === null) return { ...base, conversationId }
  return { ...base, occurrenceId: input.subjectId, occurrenceKind: subject.occurrenceKind }
}
