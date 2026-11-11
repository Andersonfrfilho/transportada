/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 (T2): o vocabulário da caixa de conversas do WhatsApp. Módulo separado da ocorrência (RF8): nada aqui lê ou
 * grava a conversa da ocorrência.
 */

/** O tipo do chat sai do JID: grupo (`…@g.us`) ou privado (`<número>@s.whatsapp.net`). `@lid` nunca entra (T1). */
export const WHATSAPP_CHAT_KINDS = ['group', 'direct'] as const
export type WhatsAppChatKind = (typeof WHATSAPP_CHAT_KINDS)[number]

/** RF1: quem atende o chat. `bot` é o fluxo de sempre; `operator` é o atendente que assumiu. */
export const WHATSAPP_CHAT_STATES = ['bot', 'operator'] as const
export type WhatsAppChatState = (typeof WHATSAPP_CHAT_STATES)[number]

/** RF1/RF6: por que o chat voltou ao bot — o atendente devolveu ou o prazo venceu. */
export const WHATSAPP_CHAT_RELEASE_REASONS = ['manual', 'expired'] as const
export type WhatsAppChatReleaseReason = (typeof WHATSAPP_CHAT_RELEASE_REASONS)[number]

export const WHATSAPP_CHAT_MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const
export type WhatsAppChatMessageDirection = (typeof WHATSAPP_CHAT_MESSAGE_DIRECTIONS)[number]

/**
 * RF4/P2: quem escreveu.
 * - `driver`: o motorista (privado, ou o dono do grupo).
 * - `member`: outra pessoa do grupo do motorista (suporte, ajudante).
 * - `bot`: o fluxo automático, gravado na hora do envio.
 * - `operator`: o atendente pelo painel, com `author_user_id`.
 * - `phone`: digitado no celular (ou WhatsApp Web) do número do bot, chegado como `fromMe` sem ter saído do painel (T9).
 */
export const WHATSAPP_CHAT_MESSAGE_AUTHORS = [
  'driver',
  'member',
  'bot',
  'operator',
  'phone',
] as const
export type WhatsAppChatMessageAuthor = (typeof WHATSAPP_CHAT_MESSAGE_AUTHORS)[number]

/** A direção de cada autor: é o CHECK da tabela e a regra do domínio, a mesma lista. */
export const WHATSAPP_CHAT_AUTHOR_DIRECTION: Readonly<
  Record<WhatsAppChatMessageAuthor, WhatsAppChatMessageDirection>
> = {
  bot: 'outbound',
  driver: 'inbound',
  member: 'inbound',
  operator: 'outbound',
  phone: 'outbound',
}

export const WHATSAPP_CHAT_CONTENT_KINDS = [
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker',
  'other',
] as const
export type WhatsAppChatContentKind = (typeof WHATSAPP_CHAT_CONTENT_KINDS)[number]

/**
 * Status da enviada (RF3, T1 §1): `queued` é a fase 1 (gravada antes de chamar o Evolution), `sent` fecha com o id do
 * provedor, `delivered`/`read` chegam por `messages.update`, `failed` guarda o motivo e volta a `queued` no reenvio.
 * A recebida não tem status.
 */
export const WHATSAPP_CHAT_MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
] as const
export type WhatsAppChatMessageStatus = (typeof WHATSAPP_CHAT_MESSAGE_STATUSES)[number]

/** Os motivos de falha do `sendText` do Evolution (`ContractorReplyWhatsAppSendError`, T1 §1). */
export const WHATSAPP_CHAT_FAILURE_REASONS = ['disconnected', 'number_not_found', 'failed'] as const
export type WhatsAppChatFailureReason = (typeof WHATSAPP_CHAT_FAILURE_REASONS)[number]

/** RF6: padrão de 30 min sem mensagem do atendente; a empresa ajusta entre 5 min e 8 h. */
export const WHATSAPP_CHAT_TAKEOVER_TIMEOUT_SECONDS = {
  default: 1800,
  max: 28_800,
  min: 300,
} as const

/** T1 §1: o `sendText` direto não corta o texto; o atendente escreve até 4000 caracteres. */
export const WHATSAPP_CHAT_OPERATOR_TEXT_MAX_LENGTH = 4000

/** JID de grupo do Evolution (o mesmo padrão de `fleet_driver_whatsapp_groups` e do SDK). */
export const WHATSAPP_GROUP_JID_SOURCE = '^[0-9]+(-[0-9]+)?@g\\.us$'
/** JID do privado: só o número (8 a 15 dígitos, E.164 sem `+`). `@lid` e `@c.us` ficam de fora. */
export const WHATSAPP_DIRECT_JID_SOURCE = '^[0-9]{8,15}@s\\.whatsapp\\.net$'
