/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4: os números e vocabulários da conversa por assunto no `/me` do motorista.
 */
import { OCCURRENCE_CONVERSATION_SUBJECT } from '../../shared/occurrence-conversation-subject.constant.js'

export const DRIVER_SUBJECT_LIST_PAGE_SIZE = 50
export const DRIVER_SUBJECT_MESSAGES_DEFAULT_LIMIT = 50
export const DRIVER_SUBJECT_MESSAGES_MAX_LIMIT = 100
export const DRIVER_SUBJECT_PREVIEW_LENGTH = 140
/** O recorte do dia nos rótulos: a data da viagem é a do motorista, não a do servidor. */
export const DRIVER_SUBJECT_TIME_ZONE = 'America/Sao_Paulo'
export const DRIVER_SUBJECT_RECIPIENT_NAME_MAX_LENGTH = 30

/** O motorista só abre conversa de nota e de viagem; a de ocorrência nasce do registro. */
export const OPENABLE_SUBJECT_TYPES = [
  OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT,
  OCCURRENCE_CONVERSATION_SUBJECT.TRIP,
] as const
export type OpenableSubjectType = (typeof OPENABLE_SUBJECT_TYPES)[number]

export function isOpenableSubjectType(subjectType: string): subjectType is OpenableSubjectType {
  return OPENABLE_SUBJECT_TYPES.some((openable) => openable === subjectType)
}

/** A ordem estável dos selos de canal na lista e no cabeçalho. */
export const SUBJECT_CHANNEL_ORDER = ['app', 'whatsapp', 'email', 'portal'] as const
export type SubjectChannel = (typeof SUBJECT_CHANNEL_ORDER)[number]

/** O único que o INSERT da conversa repete uma vez (ADR-0101 §5); os outros únicos são o assunto. */
export const CONVERSATION_PROTOCOL_UNIQUE_CONSTRAINT =
  'occurrence_conversations_company_protocol_unique'
export const CONVERSATION_PROTOCOL_INSERT_ATTEMPTS = 2

/** A idempotência da resposta de nota e de viagem; a de ocorrência segue a operação antiga, para a fila offline não duplicar. */
export const REPLY_SUBJECT_APP_MESSAGE_OPERATION = 'conversation.app.reply'
