/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T6b (RF12): a mensagem do sistema da conversa ("Boleto enviado para o e-mail: …") sai das leituras como
 * `systemNotice`, para a tela desenhar a linha do sistema (centralizada, sem balde de autor) sem depender do texto. O
 * `jsonb` vem do banco e quem o grava é o worker; qualquer forma que a leitura não reconhece some em vez de virar um
 * balão enganoso — a mensagem segue lida como a automática comum.
 */
import {
  OCCURRENCE_CONVERSATION_SYSTEM_NOTICE_ACTOR_KINDS,
  OCCURRENCE_CONVERSATION_SYSTEM_NOTICE_KINDS,
} from '../../database/occurrence-conversation.schema.js'

export type OccurrenceConversationSystemNoticeView = {
  readonly actorKind: (typeof OCCURRENCE_CONVERSATION_SYSTEM_NOTICE_ACTOR_KINDS)[number]
  readonly actorName: null | string
  readonly deliveryId: string
  readonly kind: (typeof OCCURRENCE_CONVERSATION_SYSTEM_NOTICE_KINDS)[number]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readSystemNotice(raw: unknown): OccurrenceConversationSystemNoticeView | undefined {
  if (!isRecord(raw)) return undefined
  const kind = OCCURRENCE_CONVERSATION_SYSTEM_NOTICE_KINDS.find((known) => known === raw.kind)
  const actorKind = OCCURRENCE_CONVERSATION_SYSTEM_NOTICE_ACTOR_KINDS.find(
    (known) => known === raw.actorKind,
  )
  if (kind === undefined || actorKind === undefined || typeof raw.deliveryId !== 'string') {
    return undefined
  }
  return {
    actorKind,
    actorName: typeof raw.actorName === 'string' && raw.actorName !== '' ? raw.actorName : null,
    deliveryId: raw.deliveryId,
    kind,
  }
}

/** O espalhamento nas leituras: a chave só existe quando a mensagem é um aviso do sistema. */
export function systemNoticeField(
  raw: unknown,
): { readonly systemNotice: OccurrenceConversationSystemNoticeView } | Record<never, never> {
  const systemNotice = readSystemNotice(raw)
  return systemNotice === undefined ? {} : { systemNotice }
}
