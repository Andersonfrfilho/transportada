/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  type PostalCodeSuggestion,
  toPostalCodeSuggestion,
} from '../domain/postal-code-suggestion.policy.js'

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const DIGITS_IN_POSTAL_CODE_PREFIX = 5
const STATE_CODE_PATTERN = /^[A-Z]{2}$/

export type BuildGooglePostalCodeTargetParams = {
  readonly apiKey: string
  readonly postalCode: string
}

export type ReadGooglePostalCodeParams = {
  readonly payload: unknown
  readonly postalCode: string
}

type GoogleAddressComponent = {
  readonly longName: string
  readonly shortName: string
  readonly types: readonly string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readString = (value: unknown): string => (typeof value === 'string' ? value : '')

const toHyphenatedPostalCode = (postalCode: string): string =>
  `${postalCode.slice(0, DIGITS_IN_POSTAL_CODE_PREFIX)}-${postalCode.slice(DIGITS_IN_POSTAL_CODE_PREFIX)}`

/** A chave vai na query porque é o único lugar que o Geocoding aceita; ninguém loga este alvo. */
export function buildGooglePostalCodeTarget(params: BuildGooglePostalCodeTargetParams): string {
  const query = new URLSearchParams({
    components: `country:BR|postal_code:${toHyphenatedPostalCode(params.postalCode)}`,
    key: params.apiKey,
    language: 'pt-BR',
  })

  return `${GOOGLE_GEOCODING_URL}?${query.toString()}`
}

function readComponents(result: unknown): readonly GoogleAddressComponent[] {
  if (!isRecord(result) || !Array.isArray(result.address_components)) return []

  return result.address_components.filter(isRecord).map((component) => ({
    longName: readString(component.long_name).trim(),
    shortName: readString(component.short_name).trim(),
    types: Array.isArray(component.types)
      ? component.types.filter((type): type is string => typeof type === 'string')
      : [],
  }))
}

const findComponent = (
  components: readonly GoogleAddressComponent[],
  type: string,
): GoogleAddressComponent | undefined =>
  components.find((component) => component.types.includes(type))

/**
 * O filtro por CEP não obriga o Google a achar **aquele** CEP: sem o exato, ele devolve o vizinho,
 * com a rua do vizinho. Resposta cujo CEP não é o pedido vira vazio. O logradouro vem de `long_name`
 * — o `short_name` abrevia ("R. Rad. Alfeu Stabelini") — e a UF de `short_name`, que é a sigla.
 */
export function readGooglePostalCode({
  payload,
  postalCode,
}: ReadGooglePostalCodeParams): PostalCodeSuggestion | null {
  if (!isRecord(payload) || payload.status !== 'OK' || !Array.isArray(payload.results)) return null
  const components = readComponents(payload.results[0])
  const answeredPostalCode = findComponent(components, 'postal_code')?.longName.replace('-', '')
  if (answeredPostalCode !== postalCode) return null
  const state = findComponent(components, 'administrative_area_level_1')?.shortName ?? ''

  return toPostalCodeSuggestion({
    city: findComponent(components, 'administrative_area_level_2')?.longName ?? '',
    district: findComponent(components, 'sublocality')?.longName ?? '',
    state: STATE_CODE_PATTERN.test(state) ? state : '',
    street: findComponent(components, 'route')?.longName ?? '',
  })
}
