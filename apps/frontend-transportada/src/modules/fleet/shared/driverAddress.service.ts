/* Copyright (c) 2026 Ada Technology. MIT License. */
import { stripPostalCode } from '@/modules/shared/postalCode.service'

import { BRAZIL_STATE } from './fleet.types'
import { isRecord, isString } from './fleetGuards.validation'

/**
 * Um endereço resolvido por um provedor externo, já no vocabulário do formulário.
 *
 * ⚠️ **A coordenada voltou, e não é uma consulta nova.** Ela sempre chegou no GeoJSON do Photon e
 * era descartada desde que a ADR-0037 tirou o mapa do cadastro — o retorno da viagem (spec 097 D6)
 * precisa dela, e comprá-la de provedor pago é o que a ADR-0044 recusa. `null` quando o provedor não
 * mandou par legível: o endereço continua servindo, e o que se perde é só o retorno automático.
 */
export type AddressSuggestion = Readonly<{
  city: string
  district: string
  label: string
  latitude: null | string
  longitude: null | string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type AddressLookupInput = Readonly<{
  fetch: typeof globalThis.fetch
  signal: AbortSignal
  term: string
}>

const PHOTON_URL = 'https://photon.komoot.io/api'

export const ADDRESS_SUGGESTION_LIMIT = 6

/** Termo curto casa com meia cidade: a busca só sai depois que há endereço reconhecível. */
export const ADDRESS_SEARCH_MINIMUM_LENGTH = 5

/**
 * Photon devolve a UF pelo nome ("São Paulo"), e a API só aceita duas letras. Esta tabela é dado de
 * domínio, não texto de tela: traduzi-la no `*.locale.json` faria a sigla depender do idioma.
 */
const STATE_CODE_BY_NAME: Readonly<Record<string, string>> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
}

function readText(source: Readonly<Record<string, unknown>>, key: string): string {
  const value = source[key]
  return isString(value) ? value.trim() : ''
}

function readFirstText(source: Readonly<Record<string, unknown>>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = readText(source, key)
    if (value !== '') return value
  }
  return ''
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {}
}

function withoutAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}

export function toStateCode(value: string): string {
  const trimmed = value.trim()
  const upper = withoutAccents(trimmed).toUpperCase()
  if (BRAZIL_STATE.some((state) => state === upper)) return upper
  return STATE_CODE_BY_NAME[withoutAccents(trimmed).toLowerCase()] ?? ''
}

function buildLabel(suggestion: Omit<AddressSuggestion, 'label'>): string {
  const street =
    suggestion.number === '' ? suggestion.street : `${suggestion.street}, ${suggestion.number}`
  const region =
    suggestion.state === '' ? suggestion.city : `${suggestion.city} — ${suggestion.state}`
  return [street, suggestion.district, region].filter((part) => part !== '').join(' · ')
}

function buildSuggestion(input: Omit<AddressSuggestion, 'label'>): AddressSuggestion | null {
  if (input.city === '' && input.street === '') return null
  return { ...input, label: buildLabel(input) }
}

async function readJson(
  input: Readonly<{ fetch: typeof globalThis.fetch; signal: AbortSignal; url: string }>,
): Promise<unknown> {
  const response = await input.fetch(input.url, {
    headers: { accept: 'application/json' },
    signal: input.signal,
  })
  if (!response.ok) throw new Error(`ADDRESS_LOOKUP_${String(response.status)}`)
  return (await response.json()) as unknown
}

function fromPhotonFeature(feature: unknown): AddressSuggestion | null {
  if (!isRecord(feature)) return null
  const properties = readRecord(feature.properties)
  const street = readFirstText(properties, ['street', 'name'])
  return buildSuggestion({
    city: readFirstText(properties, ['city', 'town', 'village', 'county']),
    district: readFirstText(properties, ['district', 'suburb']),
    ...readCoordinate(feature.geometry),
    number: readText(properties, 'housenumber'),
    postalCode: stripPostalCode(readText(properties, 'postcode')),
    state: toStateCode(readText(properties, 'state')),
    street,
  })
}

/**
 * ⚠️ **GeoJSON é `[longitude, latitude]`, nesta ordem** — o inverso de como se fala. Trocar as duas
 * põe a casa de Sertãozinho no Oceano Índico, e o número continua parecendo uma coordenada.
 *
 * ⚠️ Meia coordenada não existe: metade ilegível descarta o par inteiro, porque um par pela metade
 * cairia no meridiano ou no equador. É o mesmo que o CHECK do banco recusa do outro lado.
 */
function readCoordinate(geometry: unknown): {
  readonly latitude: null | string
  readonly longitude: null | string
} {
  const ausente = { latitude: null, longitude: null } as const
  if (!isRecord(geometry) || !Array.isArray(geometry.coordinates)) return ausente

  const [longitude, latitude] = geometry.coordinates as readonly unknown[]
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return ausente
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return ausente

  return { latitude: String(latitude), longitude: String(longitude) }
}

function toList(payload: unknown, key: string): readonly unknown[] {
  if (isList(payload)) return payload
  if (!isRecord(payload)) return []
  return isList(payload[key]) ? payload[key] : []
}

/** `Array.isArray` sobre `unknown` estreita para `any[]`, e o `any` vaza para quem desestrutura. */
function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function buildPhotonUrl(term: string): string {
  const query = new URLSearchParams({
    lang: 'pt',
    limit: String(ADDRESS_SUGGESTION_LIMIT),
    q: term,
  })
  return `${PHOTON_URL}?${query.toString()}`
}

function dedupe(suggestions: readonly AddressSuggestion[]): readonly AddressSuggestion[] {
  const seen = new Set<string>()
  const unique: AddressSuggestion[] = []
  for (const suggestion of suggestions) {
    const key = withoutAccents(suggestion.label).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(suggestion)
  }
  return unique.slice(0, ADDRESS_SUGGESTION_LIMIT)
}

/**
 * Um provedor só, e é o Photon: o Nominatim saiu pela ADR-0037, porque a política dele pede um
 * `User-Agent` identificável que o `fetch` do navegador não deixa mandar. O `Promise.allSettled`
 * sobre uma lista de um continua sendo o certo — provedor fora do ar entrega menos, nunca erro.
 */
export async function searchAddress(
  input: AddressLookupInput,
): Promise<readonly AddressSuggestion[]> {
  const term = input.term.trim()
  if (term.length < ADDRESS_SEARCH_MINIMUM_LENGTH) return []
  const { fetch, signal } = input
  const responses = await Promise.allSettled([
    readJson({ fetch, signal, url: buildPhotonUrl(term) }).then((payload) =>
      toList(payload, 'features').map(fromPhotonFeature),
    ),
  ])
  const suggestions = responses.flatMap((response) =>
    response.status === 'fulfilled' ? response.value : [],
  )
  return dedupe(
    suggestions.filter((suggestion): suggestion is AddressSuggestion => suggestion !== null),
  )
}
