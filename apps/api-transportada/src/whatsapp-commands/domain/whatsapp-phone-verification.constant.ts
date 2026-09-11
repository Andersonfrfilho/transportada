/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Teto de tentativas do código de verificação: o CHECK do banco e o repositório leem daqui. */
export const WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS = 5

/** Spec 144 D1: a operadora recicla chip, e o novo dono herdaria a conta. Inclusivo no limite. */
export const WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS = 90
