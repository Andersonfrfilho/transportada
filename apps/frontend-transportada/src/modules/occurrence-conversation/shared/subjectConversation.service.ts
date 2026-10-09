/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 260 T3.1/T3.2 (RF12, ADR-0101 D4): o que o escritório pode fazer na conversa de nota e de
 * viagem, em serviço puro. Escrever é `trip.manage` e some quando a viagem acaba (concluída ou
 * cancelada); a conversa encerrada continua legível. A palavra final é da API (`409
 * CONVERSATION_CLOSED`) — aqui só se evita oferecer o que ela vai recusar.
 */
import type {
  SubjectConversationRef,
  SubjectConversationSummary,
} from './subjectConversation.types'

/** Cópia por valor de `TRIP_TERMINAL_STATUSES` da API: depois delas a conversa não aceita escrita. */
const TERMINAL_TRIP_STATUSES: readonly string[] = ['completed', 'cancelled']

export type SubjectConversationAccess = Readonly<{
  canClose: boolean
  /** Abrir a que não existe, ou reabrir a que o escritório encerrou. */
  canOpen: boolean
  canSend: boolean
  canView: boolean
  isClosed: boolean
}>

export function resolveSubjectConversationAccess(
  input: Readonly<{
    canManage: boolean
    summary: SubjectConversationSummary | undefined
    tripStatus: string
  }>,
): SubjectConversationAccess {
  const { canManage, summary, tripStatus } = input
  const isTripOver = TERMINAL_TRIP_STATUSES.includes(tripStatus)
  const isClosed = summary !== undefined && (summary.status === 'closed' || isTripOver)
  const isWritable = canManage && !isTripOver
  const isOpen = summary !== undefined && !isClosed
  return {
    canClose: isWritable && isOpen,
    canOpen: isWritable && (summary === undefined || isClosed),
    canSend: isWritable && isOpen,
    canView: summary !== undefined,
    isClosed,
  }
}

export type SubjectConversationErrorKey =
  | 'closed'
  | 'driverChanged'
  | 'generic'
  | 'noDriver'
  | 'notFound'

const ERROR_KEY_BY_CODE: Readonly<Record<string, SubjectConversationErrorKey>> = {
  CONVERSATION_CLOSED: 'closed',
  CONVERSATION_NO_DRIVER: 'noDriver',
  CONVERSATION_NOT_FOUND: 'notFound',
  OCCURRENCE_CONVERSATION_DRIVER_CHANGED: 'driverChanged',
}

export function resolveSubjectConversationErrorKey(error: unknown): SubjectConversationErrorKey {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : ''
  return ERROR_KEY_BY_CODE[code] ?? 'generic'
}

export function findSubjectConversation(
  list: readonly SubjectConversationSummary[] | undefined,
  subject: Pick<SubjectConversationRef, 'subjectId' | 'subjectType'>,
): SubjectConversationSummary | undefined {
  return list?.find(
    (summary) =>
      summary.subjectId === subject.subjectId && summary.subjectType === subject.subjectType,
  )
}

/** O que o motorista mandou e ninguém do escritório leu, nas conversas ainda abertas. */
export function countSubjectUnread(list: readonly SubjectConversationSummary[]): number {
  return list.reduce(
    (total, summary) => total + (summary.status === 'open' ? summary.unreadCount : 0),
    0,
  )
}

/** Uma chave por mensagem escrita: reenviar depois de uma queda de rede não duplica. */
export function createSubjectMessageIdempotencyKey(randomId: () => string): string {
  return `subject-message:${randomId()}`
}
