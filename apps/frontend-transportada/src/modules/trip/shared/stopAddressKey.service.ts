/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ⚠️ **Cópia por valor** de `api-transportada/src/trips/domain/stop-address-key.ts`, no mesmo
 * padrão de `worker-transportada/src/routing/domain/pool-address-key.ts`: o bundle não carrega
 * código da API, e `test/trip/stop-address-key-parity.contract.ts` compara os dois arquivos.
 *
 * Divergir aqui é o defeito caro: a parada que a tela desenha e a parada que o vínculo cria deixam
 * de casar, e o roteiro nasce com duas paradas no mesmo portão.
 *
 * ADR-0043 §3: a parada agrupa por endereço de entrega distinto — `(postal_code, number,
 * city_code)` —, nunca por CNPJ do destinatário. `01310-100` e `01310100`, `nº 45` e `45` são o
 * mesmo lugar, e duas variantes viram duas paradas no mesmo portão.
 */
const POSTAL_CODE_LENGTH = 8

/** `nº`, `n°`, `no.`, `numero`, `número` — todas as grafias de "número" que aparecem em endereço. */
const NUMBER_PREFIX_PATTERN = /^n[ºo°]?\.?\s*/iu

/** "S/N", "SN", "sem número" — sem número é, ele mesmo, um endereço, e precisa de uma chave só. */
const NO_NUMBER_PATTERN = /^(?:s\s*\/?\s*n|sem\s*n[uú]mero)$/iu

export const NO_NUMBER_KEY = 'S/N'

export type StopAddressComponents = Readonly<{
  cityCode: null | string
  number: null | string
  postalCode: null | string
}>

/** `null` quando o CEP não tem os 8 dígitos exigidos — sinal de parada sem endereço utilizável. */
export function normalizePostalCode(postalCode: null | string): null | string {
  if (postalCode === null) return null

  const digits = postalCode.replace(/\D/gu, '')
  return digits.length === POSTAL_CODE_LENGTH ? digits : null
}

/** Nunca `null`: endereço sem número é `S/N`, um lugar tão válido quanto qualquer outro. */
export function normalizeAddressNumber(number: null | string): string {
  const trimmed = (number ?? '').trim()
  if (trimmed.length === 0 || NO_NUMBER_PATTERN.test(trimmed)) return NO_NUMBER_KEY

  return trimmed.replace(NUMBER_PREFIX_PATTERN, '').trim().toUpperCase().replace(/\s+/gu, ' ')
}

export function normalizeCityCode(cityCode: null | string): string {
  return (cityCode ?? '').trim()
}

export function buildStopAddressKey(components: StopAddressComponents): null | string {
  const postalCode = normalizePostalCode(components.postalCode)
  if (postalCode === null) return null

  const number = normalizeAddressNumber(components.number)
  const cityCode = normalizeCityCode(components.cityCode)

  return `${cityCode}|${postalCode}|${number}`
}
