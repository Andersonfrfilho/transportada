/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

import {
  WHATSAPP_PHONE_VERIFICATION_CODE_LENGTH,
  WHATSAPP_PHONE_VERIFICATION_CODE_SPACE,
} from '../domain/whatsapp-phone-verification.constant.js'

export function generateWhatsAppVerificationCode(): string {
  return randomInt(WHATSAPP_PHONE_VERIFICATION_CODE_SPACE)
    .toString()
    .padStart(WHATSAPP_PHONE_VERIFICATION_CODE_LENGTH, '0')
}

export function hashWhatsAppVerificationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** Digests de tamanho fixo: o CHECK garante 64 hex no banco, então não há ramo de comprimento. */
export function matchesWhatsAppVerificationCode(input: {
  readonly code: string
  readonly codeHash: string
}): boolean {
  const stored = Buffer.from(input.codeHash, 'hex')
  const attempted = createHash('sha256').update(input.code).digest()
  return stored.length === attempted.length && timingSafeEqual(stored, attempted)
}
