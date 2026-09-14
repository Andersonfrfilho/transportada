/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { WHATSAPP_PHONE_VERIFIED_REPLY } from './whatsapp-command.constant.js'

/** Marcação do WhatsApp e quebra de linha: um nome com `*` desfaria o negrito da própria frase. */
const NAME_MARKUP_PATTERN = /[*_~`\r\n]/gu
const REPEATED_SPACE_PATTERN = /\s+/gu

/**
 * Spec 144 T005b B2: quem mandou o código do próprio celular vê **para quem** o número foi. Só o
 * nome de exibição — nunca e-mail nem CPF. Sem ficha, a confirmação sai sem nome.
 */
export function buildWhatsAppPhoneVerifiedReply(displayName: string | undefined): string {
  const name = (displayName ?? '')
    .replace(NAME_MARKUP_PATTERN, ' ')
    .replace(REPEATED_SPACE_PATTERN, ' ')
    .trim()
  if (name === '') return WHATSAPP_PHONE_VERIFIED_REPLY

  return `✅ Número vinculado a *${name}*.`
}
