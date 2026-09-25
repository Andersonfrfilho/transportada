/* Cópia por valor de apps/frontend-transportada/src/modules/identity/shared/whatsappPhone.constant.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */

export const WHATSAPP_PHONE_PATH = '/me/whatsapp-phone'
export const WHATSAPP_PHONE_VERIFICATION_PATH = '/me/whatsapp-phone/verification'

export const WHATSAPP_PHONE_ERROR = {
  CHANNEL_NUMBER_MISSING: 'WHATSAPP_CHANNEL_NUMBER_MISSING',
  INVALID_PHONE: 'WHATSAPP_PHONE_INVALID',
  REQUEST_FAILED: 'WHATSAPP_PHONE_REQUEST_FAILED',
  RESPONSE_INVALID: 'WHATSAPP_PHONE_RESPONSE_INVALID',
} as const

/** Cópia por valor: só para exibir "válido por 90 dias" — a validade em si é decidida no servidor. */
export const WHATSAPP_PHONE_VALIDITY_DAYS = 90

/**
 * Spec 144 T020 (B6): a verificação acontece no WhatsApp, não nesta tela. Enquanto houver código à
 * espera, o `GET` é relido nesse intervalo — é assim que a tela percebe o número verificado.
 */
export const WHATSAPP_PHONE_POLL_INTERVAL_MS = 5_000
