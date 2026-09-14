/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor de `api-transportada/src/whatsapp-commands/domain/whatsapp-phone-verification.constant.ts`
 * — o worker não importa código da API. A paridade é `test/whatsapp-phone/parity.contract.ts`.
 */

/** Spec 144 D1: a operadora recicla chip, e o novo dono herdaria a conta. Inclusivo no limite. */
export const WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS = 90
export const WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS =
  WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS * 86_400_000
