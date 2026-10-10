/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 (ADR-0101 §3): quem alcança a conversa de nota e de viagem é o destinatário dela ou o
 * motorista principal da viagem agora (a conversa acompanha o principal, sem escrita na leitura).
 * Sem conversa ainda, o assunto da tripulação é alcançável — só não há o que ler.
 */
import {
  OCCURRENCE_CONVERSATION_SUBJECT,
  type OccurrenceConversationSubjectType,
} from '../../shared/occurrence-conversation-subject.constant.js'

export function canReachSubjectConversation(input: {
  readonly conversationDriverUserId: null | string
  readonly driverUserId: string
  readonly isPrincipal: boolean
  readonly subjectType: OccurrenceConversationSubjectType
}): boolean {
  if (input.conversationDriverUserId === null) return true
  if (input.conversationDriverUserId === input.driverUserId) return true
  return input.subjectType !== OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE && input.isPrincipal
}
