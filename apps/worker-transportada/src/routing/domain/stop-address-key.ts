/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A chave de parada é `${cityCode}|${postalCode}|${number}` (spec 056), e a cascata precisa de duas
 * das três partes: o CEP para o degrau 1 e o código de município para o degrau 2.
 *
 * ⚠️ Este é o **segundo** consumidor do formato da chave dentro do worker — o primeiro é
 * `pool-address-key.ts`, que a monta. Mudar o formato quebra os dois, e é por isso que ele é travado
 * por contrato (T016): uma normalização ajustada sem querer invalidaria a base inteira de
 * coordenadas de uma vez, em silêncio.
 */
export type StopAddressKeyParts = Readonly<{
  cityCode: string
  number: string
  postalCode: string
}>

const PART_COUNT = 3

export function parseStopAddressKey(addressKey: string): StopAddressKeyParts | null {
  const parts = addressKey.split('|')
  if (parts.length !== PART_COUNT) return null

  const [cityCode = '', postalCode = '', number = ''] = parts
  /** Sem CEP não há degrau 1, e sem município não há degrau 2: a chave não serve para nada aqui. */
  if (postalCode.length === 0 && cityCode.length === 0) return null

  return { cityCode, number, postalCode }
}
