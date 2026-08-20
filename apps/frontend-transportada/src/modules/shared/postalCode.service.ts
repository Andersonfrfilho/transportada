/* Copyright (c) 2026 Ada Technology. MIT License. */
export const POSTAL_CODE_LENGTH = 8

/** Nenhum corte por tamanho: dígito excedente precisa continuar visível para a validação acusar. */
export function stripPostalCode(value: string): string {
  return value.replace(/\D/g, '')
}

export function formatPostalCode(value: string): string {
  const digits = stripPostalCode(value)
  if (digits.length > POSTAL_CODE_LENGTH) return digits
  return digits.replace(/^(\d{5})(\d)/, '$1-$2')
}

export function isCompletePostalCode(value: string): boolean {
  return stripPostalCode(value).length === POSTAL_CODE_LENGTH
}
