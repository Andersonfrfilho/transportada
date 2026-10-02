/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Chave de acesso de NF-e modelo 55 com dígito verificador válido, para semear nota e foto com a
 * mesma chave. A conta do módulo 11 é reescrita aqui de propósito: o teste não pode confiar na
 * régua que ele mesmo está prendendo.
 */
const KEY_PREFIX = '352409' + '12345678000199' + '55'
const KEY_SUFFIX = '1' + '87654321'

export type BuildAccessKeyParams = Readonly<{ number: number; series: number }>

export function buildAccessKey({ number, series }: BuildAccessKeyParams): string {
  const base = `${KEY_PREFIX}${String(series).padStart(3, '0')}${String(number).padStart(9, '0')}${KEY_SUFFIX}`
  let sum = 0
  let weight = 2
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const remainder = sum % 11
  return `${base}${remainder < 2 ? 0 : 11 - remainder}`
}
