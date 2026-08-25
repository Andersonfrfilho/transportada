/* Copyright (c) 2026 Ada Technology. MIT License. */
export const PHONE_MAX_LENGTH = 11
/** Largura do campo já mascarado — `(11) 98765-4321`; sem ela o `maxLength` cortaria a pontuação. */
export const PHONE_MASK_LENGTH = 15
const LANDLINE_LENGTH = 10

/** Nenhum corte por tamanho: dígito excedente precisa continuar visível para a validação acusar. */
export function stripPhone(value: string): string {
  return value.replace(/\D/g, '')
}

/** O nono dígito move o hífen: celular quebra em 5-4, fixo em 4-4. */
export function formatPhone(value: string): string {
  const digits = stripPhone(value)
  if (digits.length > PHONE_MAX_LENGTH) return digits
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`

  const areaCode = digits.slice(0, 2)
  const subscriber = digits.slice(2)
  if (subscriber.length <= 4) return `(${areaCode}) ${subscriber}`

  const split = digits.length > LANDLINE_LENGTH ? 5 : 4
  return `(${areaCode}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`
}

export function isCompletePhone(value: string): boolean {
  const length = stripPhone(value).length
  return length === LANDLINE_LENGTH || length === PHONE_MAX_LENGTH
}
