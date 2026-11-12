/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T2 (RF1, RF6): regras puras de quem atende o chat. Sem relógio próprio: `now` vem de quem chama.
 */
import {
  WHATSAPP_CHAT_TAKEOVER_TIMEOUT_SECONDS,
  type WhatsAppChatState,
} from './whatsapp-chat.constant.js'

/** O mínimo que as regras leem do chat. */
export type WhatsAppChatTakeoverFacts = {
  readonly expiresAt: Date | null
  readonly state: WhatsAppChatState
  readonly takenOverByUserId: string | null
}

export type WhatsAppChatAttendance =
  | { readonly kind: 'bot' }
  | { readonly expiresAt: Date; readonly kind: 'operator'; readonly userId: string }

/**
 * Quem atende **agora**. O vencimento é checado na leitura (plano: "checagem na leitura"): um chat `operator` com o
 * prazo passado já é do bot, mesmo antes de o job da T7 gravar a devolução. É esta a resposta da guarda da T3.
 */
export function resolveWhatsAppChatAttendance(
  chat: WhatsAppChatTakeoverFacts,
  now: Date,
): WhatsAppChatAttendance {
  if (chat.state !== 'operator' || chat.takenOverByUserId === null || chat.expiresAt === null) {
    return { kind: 'bot' }
  }
  if (chat.expiresAt.getTime() <= now.getTime()) return { kind: 'bot' }
  return { expiresAt: chat.expiresAt, kind: 'operator', userId: chat.takenOverByUserId }
}

export function isWhatsAppChatTakenOver(chat: WhatsAppChatTakeoverFacts, now: Date): boolean {
  return resolveWhatsAppChatAttendance(chat, now).kind === 'operator'
}

/**
 * O que assumir faz (RF1, caso extremo "dois atendentes"):
 * - `take`: o chat está com o bot (ou o prazo venceu) — assume.
 * - `renew`: o próprio atendente já segura — só empurra o vencimento.
 * - `held`: outro atendente segura e o prazo vale — recusa com quem segura.
 *
 * O repositório faz a mesma conta dentro de um `UPDATE … WHERE` (atômico); esta função é a regra escrita.
 */
export type WhatsAppChatTakeOverDecision =
  | { readonly kind: 'take' }
  | { readonly kind: 'renew' }
  | { readonly expiresAt: Date; readonly holderUserId: string; readonly kind: 'held' }

export function decideWhatsAppChatTakeOver(
  chat: WhatsAppChatTakeoverFacts,
  userId: string,
  now: Date,
): WhatsAppChatTakeOverDecision {
  const attendance = resolveWhatsAppChatAttendance(chat, now)
  if (attendance.kind === 'bot') return { kind: 'take' }
  if (attendance.userId === userId) return { kind: 'renew' }
  return { expiresAt: attendance.expiresAt, holderUserId: attendance.userId, kind: 'held' }
}

/**
 * RF6: o prazo da empresa, dentro da faixa. Sem configuração (Evolution não cadastrado) ou valor fora da faixa, o
 * padrão de 30 min.
 */
export function resolveWhatsAppChatTakeoverTimeoutSeconds(configured: number | null): number {
  const { default: fallback, max, min } = WHATSAPP_CHAT_TAKEOVER_TIMEOUT_SECONDS
  if (configured === null || !Number.isInteger(configured)) return fallback
  return configured >= min && configured <= max ? configured : fallback
}

/** O vencimento a partir de agora: assumir e cada mensagem do atendente empurram o prazo (RF6). */
export function computeWhatsAppChatTakeoverExpiry(now: Date, timeoutSeconds: number): Date {
  return new Date(now.getTime() + resolveWhatsAppChatTakeoverTimeoutSeconds(timeoutSeconds) * 1000)
}
