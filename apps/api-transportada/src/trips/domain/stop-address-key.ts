/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ADR-0043 §3: a parada agrupa por endereço de entrega distinto — `(postal_code, number,
 * city_code)` de `nfe_addresses` — nunca por CNPJ do destinatário. `01310-100` e `01310100`,
 * `nº 45` e `45` são o mesmo lugar, e duas variantes viram duas paradas no mesmo portão.
 */
export type StopAddressComponents = {
  readonly cityCode: string | null
  readonly number: string | null
  readonly postalCode: string | null
}

const POSTAL_CODE_LENGTH = 8

/** `nº`, `n°`, `no.`, `numero`, `número` — todas as grafias de "número" que aparecem em endereço. */
const NUMBER_PREFIX_PATTERN = /^n[ºo°]?\.?\s*/iu

/** "S/N", "SN", "sem número" — sem número é, ele mesmo, um endereço, e precisa de uma chave só. */
const NO_NUMBER_PATTERN = /^(?:s\s*\/?\s*n|sem\s*n[uú]mero)$/iu

export const NO_NUMBER_KEY = 'S/N'

/**
 * `null` quando o CEP não tem os 8 dígitos exigidos — sinal para o chamador tratar como parada
 * `SEM ENDEREÇO` (spec 056, Casos extremos), não uma chave inventada que pareceria válida.
 */
export function normalizePostalCode(postalCode: string | null): string | null {
  if (postalCode === null) return null

  const digits = postalCode.replace(/\D/gu, '')
  return digits.length === POSTAL_CODE_LENGTH ? digits : null
}

/** Nunca `null`: endereço sem número é `S/N`, um lugar tão válido quanto qualquer outro. */
export function normalizeAddressNumber(number: string | null): string {
  const trimmed = (number ?? '').trim()
  if (trimmed.length === 0 || NO_NUMBER_PATTERN.test(trimmed)) return NO_NUMBER_KEY

  return trimmed.replace(NUMBER_PREFIX_PATTERN, '').trim().toUpperCase().replace(/\s+/gu, ' ')
}

export function normalizeCityCode(cityCode: string | null): string {
  return (cityCode ?? '').trim()
}

/**
 * `null` quando o CEP não normaliza — o chamador (T010) usa isso para decidir a parada
 * `SEM ENDEREÇO` que impede `route_planned` enquanto existir (spec 056, Casos extremos).
 */
export function buildStopAddressKey(components: StopAddressComponents): string | null {
  const postalCode = normalizePostalCode(components.postalCode)
  if (postalCode === null) return null

  const number = normalizeAddressNumber(components.number)
  const cityCode = normalizeCityCode(components.cityCode)

  return `${cityCode}|${postalCode}|${number}`
}
