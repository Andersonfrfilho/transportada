/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Teto de tentativas do código de verificação: o CHECK do banco e o repositório leem daqui. */
export const WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS = 5

/** Spec 144 D1: a operadora recicla chip, e o novo dono herdaria a conta. Inclusivo no limite. */
export const WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS = 90

/** Janela do código de entrada (plan § Segurança). */
export const WHATSAPP_PHONE_VERIFICATION_TTL_MS = 10 * 60_000

/** Seis dígitos: `randomInt` sorteia abaixo deste teto e o zero à esquerda completa. */
export const WHATSAPP_PHONE_VERIFICATION_CODE_LENGTH = 6
export const WHATSAPP_PHONE_VERIFICATION_CODE_SPACE = 10 ** WHATSAPP_PHONE_VERIFICATION_CODE_LENGTH

/** A mensagem que é só o código, com espaço tolerado em volta — o teclado do celular o põe. */
export const WHATSAPP_PHONE_VERIFICATION_CODE_MESSAGE_PATTERN = /^\s*(\d{6})\s*$/

export const WHATSAPP_PHONE_AUDIT = {
  collision: 'whatsapp_phone.verification_collision',
  entityType: 'user_whatsapp_phone',
  permission: 'whatsapp.phone',
  targetType: 'user',
  unbound: 'whatsapp_phone.unbound',
  verified: 'whatsapp_phone.verified',
} as const
