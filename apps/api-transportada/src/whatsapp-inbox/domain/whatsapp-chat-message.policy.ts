/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T2 (RF3, RF4): regras puras do histórico. As mesmas que os CHECKs de `whatsapp_chat_messages` cobram.
 */
import {
  WHATSAPP_CHAT_AUTHOR_DIRECTION,
  WHATSAPP_CHAT_MESSAGE_STATUSES,
  type WhatsAppChatMessageAuthor,
  type WhatsAppChatMessageDirection,
  type WhatsAppChatMessageStatus,
} from './whatsapp-chat.constant.js'

export function whatsAppChatMessageDirection(
  author: WhatsAppChatMessageAuthor,
): WhatsAppChatMessageDirection {
  return WHATSAPP_CHAT_AUTHOR_DIRECTION[author]
}

/** O status com que a mensagem nasce: a recebida não tem; a do painel nasce `queued` (fase 1); bot e celular, `sent`. */
export function initialWhatsAppChatMessageStatus(
  author: WhatsAppChatMessageAuthor,
): WhatsAppChatMessageStatus | null {
  if (whatsAppChatMessageDirection(author) === 'inbound') return null
  return author === 'operator' ? 'queued' : 'sent'
}

const STATUS_RANK: Readonly<Record<Exclude<WhatsAppChatMessageStatus, 'failed'>, number>> = {
  delivered: 2,
  queued: 0,
  read: 3,
  sent: 1,
}

/**
 * O status só avança (o mesmo princípio do `applyProviderMessageStatus` da 281): `queued → sent → delivered → read`.
 * `failed` só sai de `queued` (o envio falhou antes do id) e só volta a `queued` (o reenvio usa a mesma linha).
 * Status do provedor que chega atrasado nunca rebaixa.
 */
export function canAdvanceWhatsAppChatMessageStatus(
  from: WhatsAppChatMessageStatus,
  to: WhatsAppChatMessageStatus,
): boolean {
  if (from === 'failed') return to === 'queued'
  if (to === 'failed') return from === 'queued'
  return STATUS_RANK[to] > STATUS_RANK[from]
}

/** De quais status `to` pode vir: é o `WHERE status in (…)` do repositório, tirado da mesma regra. */
export function whatsAppChatStatusesAdvancingTo(
  to: WhatsAppChatMessageStatus,
): readonly WhatsAppChatMessageStatus[] {
  return WHATSAPP_CHAT_MESSAGE_STATUSES.filter((from) =>
    canAdvanceWhatsAppChatMessageStatus(from, to),
  )
}
