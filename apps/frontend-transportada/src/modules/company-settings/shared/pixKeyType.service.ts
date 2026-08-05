/* Copyright (c) 2026 Ada Technology. MIT License. */

export const PIX_KEY_TYPES = ['cpf', 'cnpj', 'email', 'phone', 'evp'] as const
export type PixKeyType = (typeof PIX_KEY_TYPES)[number]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EVP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COUNTRY_CODE_PHONE_PATTERN = /^\+?55\d{10,11}$/
const MOBILE_PATTERN = /^[1-9][1-9]9\d{8}$/
const MASKED_CPF_PATTERN = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/
const MASKED_CNPJ_PATTERN = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/
const DIGITS_PATTERN = /^\d+$/
const CPF_LENGTH = 11
const CNPJ_LENGTH = 14

/** O BACEN não devolve o tipo da chave PIX — a UI infere pelo formato para orientar o usuário. */
export function detectPixKeyType(value: string): PixKeyType | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (EMAIL_PATTERN.test(trimmed)) return 'email'
  if (EVP_PATTERN.test(trimmed)) return 'evp'
  if (COUNTRY_CODE_PHONE_PATTERN.test(trimmed)) return 'phone'
  // A pontuação do documento é a prova do tipo que os dígitos crus não dão.
  if (MASKED_CPF_PATTERN.test(trimmed)) return 'cpf'
  if (MASKED_CNPJ_PATTERN.test(trimmed)) return 'cnpj'
  if (!DIGITS_PATTERN.test(trimmed)) return undefined
  if (trimmed.length === CNPJ_LENGTH) return 'cnpj'
  if (trimmed.length !== CPF_LENGTH) return undefined
  // 11 dígitos crus também descrevem um celular com DDD — afirmar CPF aqui seria informação errada.
  if (MOBILE_PATTERN.test(trimmed)) return undefined
  return 'cpf'
}

/** CPF e CNPJ vão ao BACEN sem pontuação — a máscara colada pelo usuário não pode chegar ao payload. */
export function normalizePixKey(value: string): string {
  const trimmed = value.trim()
  const type = detectPixKeyType(trimmed)
  if (type !== 'cpf' && type !== 'cnpj') return trimmed
  return trimmed.replace(/\D/g, '')
}
