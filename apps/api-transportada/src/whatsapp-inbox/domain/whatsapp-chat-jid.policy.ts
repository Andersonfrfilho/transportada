/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  WHATSAPP_DIRECT_JID_SOURCE,
  WHATSAPP_GROUP_JID_SOURCE,
  type WhatsAppChatKind,
} from './whatsapp-chat.constant.js'

const GROUP_JID = new RegExp(WHATSAPP_GROUP_JID_SOURCE, 'u')
const DIRECT_JID = new RegExp(WHATSAPP_DIRECT_JID_SOURCE, 'u')
const PHONE_DIGITS = /^[0-9]{8,15}$/u
const DIRECT_SUFFIX = '@s.whatsapp.net'

/**
 * Spec 319 T2: o tipo do chat pelo JID, ou `null` quando ele não entra na caixa. `@lid`, `@c.us`, broadcast e
 * qualquer forma fora das duas não têm chat (T1: o privado é endereçado pelo número, nunca pelo `@lid`).
 */
export function classifyWhatsAppChatJid(jid: string): WhatsAppChatKind | null {
  if (GROUP_JID.test(jid)) return 'group'
  if (DIRECT_JID.test(jid)) return 'direct'
  return null
}

/**
 * O JID do privado a partir do número já resolvido (o `senderOf` do SDK troca `@lid` por `remoteJidAlt`/`senderPn`).
 * Aceita só dígitos (8 a 15) ou um JID de privado já pronto; o resto é `null`.
 */
export function directWhatsAppChatJid(phoneOrJid: string): string | null {
  if (DIRECT_JID.test(phoneOrJid)) return phoneOrJid
  return PHONE_DIGITS.test(phoneOrJid) ? `${phoneOrJid}${DIRECT_SUFFIX}` : null
}
