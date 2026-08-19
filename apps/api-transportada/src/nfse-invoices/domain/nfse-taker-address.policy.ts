/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O endereço do tomador como ele existe na nota de origem: toda coluna de `nfe_addresses` é
 * anulável, porque a NF-e importada é dado de terceiro e nós não a preenchemos.
 */
export type NfsePartyAddress = {
  readonly city: string | null
  readonly complement: string | null
  readonly district: string | null
  readonly number: string | null
  readonly phone: string | null
  readonly postalCode: string | null
  readonly state: string | null
  readonly street: string | null
}

/**
 * O endereço já conferido, na forma que a prefeitura lê. Complemento e telefone são os únicos
 * opcionais do contrato da v2, e viajam vazios quando a nota de origem não os tem.
 */
export type NfseTakerAddress = {
  readonly city: string
  readonly complement: string
  readonly district: string
  readonly number: string
  readonly phone: string
  readonly postalCode: string
  readonly state: string
  readonly street: string
}

const POSTAL_CODE_LENGTH = 8
const STATE_PATTERN = /^[A-Z]{2}$/u

/**
 * Endereço incompleto é a nota recusada inteira — `É necessário informar o endereço completo do
 * cliente` —, e a recusa chega tarde: a emissão é assíncrona, e reemitir retransmite o mesmo RPS
 * congelado. Por isso a conferência é aqui, na seleção, antes de a nota existir.
 */
export function resolveNfseTakerAddress(address: NfsePartyAddress | null): NfseTakerAddress | null {
  if (address === null) return null

  const city = trim(address.city)
  const district = trim(address.district)
  const number = trim(address.number)
  // O CEP chega mascarado de importação antiga; a UF, em caixa baixa de digitação manual.
  const postalCode = trim(address.postalCode).replace(/\D/gu, '')
  const state = trim(address.state).toUpperCase()
  const street = trim(address.street)

  if (city.length === 0 || district.length === 0 || number.length === 0) return null
  if (postalCode.length !== POSTAL_CODE_LENGTH) return null
  if (!STATE_PATTERN.test(state)) return null
  if (street.length === 0) return null

  return {
    city,
    complement: trim(address.complement),
    district,
    number,
    phone: trim(address.phone),
    postalCode,
    state,
    street,
  }
}

function trim(value: string | null): string {
  return value === null ? '' : value.trim()
}
