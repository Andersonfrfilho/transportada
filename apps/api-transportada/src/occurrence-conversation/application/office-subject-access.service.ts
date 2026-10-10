/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b (ADR-0101 §3–4): o passo comum dos casos de uso do escritório — achar o assunto na
 * viagem do caminho, conferir que a conversa está aberta e achar o motorista que a recebe. Fora da
 * viagem ou da empresa, é o mesmo 404.
 */
import { resolveEffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import {
  ConversationClosedError,
  ConversationNoDriverError,
  ConversationNotFoundError,
} from '../domain/occurrence-conversation.error.js'
import type { OpenableSubjectType } from '../domain/driver-subject-conversation.constant.js'
import type {
  OfficeSubject,
  OfficeSubjectKey,
  OfficeSubjectTransactionPort,
} from './office-subject-conversation.port.js'
import {
  toOfficeSubjectSummary,
  type OfficeSubjectSummary,
} from './office-subject-conversation.types.js'

export type OfficeSubjectInput = {
  readonly companyId: string
  readonly subjectId: string
  readonly subjectType: OpenableSubjectType
  readonly tripId: string
}

export async function findOfficeSubjectOrFail(
  transaction: OfficeSubjectTransactionPort,
  key: OfficeSubjectKey,
): Promise<OfficeSubject> {
  const subject = await transaction.findOfficeSubject(key)
  if (subject === null) throw new ConversationNotFoundError()
  return subject
}

/** `ignoreStoredStatus`: reabrir ignora o encerramento gravado, mas nunca o derivado (nota liberada, viagem terminal). */
export function resolveOfficeSubjectStatus(
  subject: OfficeSubject,
  subjectType: OpenableSubjectType,
  ignoreStoredStatus = false,
): 'closed' | 'open' {
  return resolveEffectiveConversationStatus({
    documentReleasedAt: subject.documentReleasedAt,
    storedStatus: ignoreStoredStatus ? 'open' : (subject.conversation?.storedStatus ?? 'open'),
    subjectType,
    tripStatus: subject.tripStatus,
  })
}

/** Quem escreve ou abre: o assunto precisa estar aberto e a viagem ter um principal para receber. */
export async function requireWritableRecipient(
  transaction: OfficeSubjectTransactionPort,
  input: OfficeSubjectInput,
  subject: OfficeSubject,
  ignoreStoredStatus = false,
): Promise<string> {
  if (resolveOfficeSubjectStatus(subject, input.subjectType, ignoreStoredStatus) === 'closed') {
    throw new ConversationClosedError()
  }
  const driverUserId = await transaction.findPrincipalDriverUserId(input)
  if (driverUserId === null) throw new ConversationNoDriverError()
  return driverUserId
}

/** O resumo da conversa pelo id, do ponto de vista do usuário do escritório que está olhando. */
export async function readOfficeSummary(
  transaction: OfficeSubjectTransactionPort,
  input: { readonly companyId: string; readonly tripId: string; readonly userId: string },
  conversationId: string,
): Promise<OfficeSubjectSummary> {
  const result = await transaction.listTripConversations({ ...input, conversationId })
  const row = result?.rows[0]
  if (row === undefined) throw new Error('subject conversation was not readable')
  return toOfficeSubjectSummary(row)
}
