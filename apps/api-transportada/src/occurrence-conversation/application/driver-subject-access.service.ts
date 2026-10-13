/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 (ADR-0101 §3): o passo comum dos casos de uso do motorista por assunto — achar o assunto na
 * tripulação dele e, para ler, conferir que a conversa é alcançável. Fora disso, o mesmo 404.
 */
import type { OccurrenceConversationSubjectType } from '../../shared/occurrence-conversation-subject.constant.js'
import { canReachSubjectConversation } from '../domain/conversation-subject-access.policy.js'
import { ConversationNotFoundError } from '../domain/occurrence-conversation.error.js'
import type {
  DriverSubjectTransactionPort,
  MyConversationSubject,
} from './driver-conversation-subject.port.js'

export type MySubjectInput = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
  readonly subjectId: string
  readonly subjectType: OccurrenceConversationSubjectType
}

export async function findMySubjectOrFail(
  transaction: DriverSubjectTransactionPort,
  input: MySubjectInput,
): Promise<MyConversationSubject> {
  const subject = await transaction.findMySubject(input)
  if (subject === null) throw new ConversationNotFoundError()
  return subject
}

export function isSubjectReachable(subject: MyConversationSubject, driverUserId: string): boolean {
  return canReachSubjectConversation({
    conversationDriverUserId: subject.conversation?.driverUserId ?? null,
    driverUserId,
    isPrincipal: subject.isPrincipal,
    subjectType: subject.subjectType,
  })
}

export async function findReachableSubjectOrFail(
  transaction: DriverSubjectTransactionPort,
  input: MySubjectInput,
): Promise<MyConversationSubject> {
  const subject = await findMySubjectOrFail(transaction, input)
  if (!isSubjectReachable(subject, input.driverUserId)) throw new ConversationNotFoundError()
  return subject
}
