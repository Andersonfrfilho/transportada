/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

const PHONE_MASK_PREFIX = '****'
const VISIBLE_DIGIT_COUNT = 4
const NON_DIGIT_PATTERN = /\D/g

// Os quatro últimos dígitos bastam para correlacionar; o DDD já localiza a pessoa.
export function maskPhone(raw: string): string {
  const digits = raw.replace(NON_DIGIT_PATTERN, '')
  if (digits.length < VISIBLE_DIGIT_COUNT) return PHONE_MASK_PREFIX

  return `${PHONE_MASK_PREFIX}${digits.slice(-VISIBLE_DIGIT_COUNT)}`
}
