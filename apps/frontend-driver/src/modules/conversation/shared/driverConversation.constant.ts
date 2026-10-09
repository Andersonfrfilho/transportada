/* Copyright (c) 2026 Ada Technology. MIT License. */
export const DRIVER_CONVERSATION_SUBJECT_TYPE = 'occurrence'

export const DRIVER_CONVERSATION_SUBJECT_TYPES = ['occurrence', 'document', 'trip'] as const

export const CURRENT_TRIP_PATH = '/me/trips/current'

export const CONVERSATIONS_PATH = `${CURRENT_TRIP_PATH}/conversations`

export const CONVERSATIONS_OPEN_PATH = `${CONVERSATIONS_PATH}/open`

/** O motorista abre conversa só de nota e de viagem; a de ocorrência nasce do registro dela (spec 260 D4). */
export const OPENABLE_SUBJECT_TYPES = ['document', 'trip'] as const

export const LEGACY_OCCURRENCE_CONVERSATIONS_PATH = `${CURRENT_TRIP_PATH}/occurrence-conversations`

/** Código do 404 de "assunto inexistente" das rotas novas; outro 404 (ou 501) é rota ainda não implantada. */
export const CONVERSATION_NOT_FOUND_CODE = 'CONVERSATION_NOT_FOUND'

export const ROUTE_NOT_IMPLEMENTED_STATUS = 501

export const PARTICIPANT_CHANNELS = ['app', 'whatsapp', 'email', 'portal', 'webchat'] as const

/** Catálogo de ícones do assunto (spec 255); nome fora dele cai no ícone do grupo. */
export const CONVERSATION_SUBJECT_ICON_NAMES = [
  'alert',
  'camera',
  'clipboard-list',
  'clock',
  'document',
  'invoice',
  'message',
  'money',
  'package',
  'truck',
] as const

/** A URL assinada do anexo vale 5 min no servidor; renovar um pouco antes de vencer. */
export const ATTACHMENT_URL_MAX_AGE_MS = 4 * 60 * 1000

export const UNREAD_CONVERSATIONS_QUERY_KEY = ['conversations', 'unread'] as const

export const UNREAD_CONVERSATIONS_REFETCH_INTERVAL_MS = 60 * 1000

export const DRIVER_CONVERSATION_ERROR = {
  CONVERSATIONS_UNAVAILABLE: 'DRIVER_CONVERSATION_UNAVAILABLE',
  OUTBOX_OWNER_MISSING: 'DRIVER_CONVERSATION_OUTBOX_OWNER_MISSING',
  REQUEST_FAILED: 'DRIVER_CONVERSATION_REQUEST_FAILED',
  RESPONSE_INVALID: 'DRIVER_CONVERSATION_RESPONSE_INVALID',
  SUBJECT_UNSUPPORTED: 'DRIVER_CONVERSATION_SUBJECT_UNSUPPORTED',
  UPLOAD_FAILED: 'DRIVER_CONVERSATION_UPLOAD_FAILED',
} as const

export const PARTICIPANT_MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'bounced',
] as const

export const CONVERSATION_OUTBOX_DATABASE_NAME = 'transportada.conversation-outbox'

export const CONVERSATION_OUTBOX_STORE_NAME = 'messages'

export const CONVERSATION_OUTBOX_LOCK_NAME = 'transportada.conversation-outbox.flush'

/** Status HTTP em que repetir com a mesma chave é o certo: sessão a renovar, limite de taxa, tempo. */
export const RETRYABLE_CLIENT_STATUSES: readonly number[] = [401, 408, 425, 429]

/** Quanto o app espera entre duas buscas de mensagem nova com a conversa aberta e a aba visível. */
export const CONVERSATION_REFRESH_INTERVAL_MS = 15 * 1000

/** Teto de ciclos pulados depois de falhas seguidas, para não martelar a API instável. */
export const CONVERSATION_REFRESH_MAX_SKIPPED_CYCLES = 7
