/* Copyright (c) 2026 Ada Technology. MIT License. */
import { POSTAL_CODE_LENGTH, stripPostalCode } from '@/modules/shared/postalCode.service'

import { BRAZIL_STATE } from './fleet.types'
import { isRecord, isString } from './fleetGuards.validation'

export type GeoPoint = Readonly<{ latitude: number; longitude: number }>

/**
 * Um endereço resolvido por um provedor externo, já no vocabulário do formulário. `point` é o que
 * o mapa consome; provedor de CEP sem coordenada devolve `null` e o mapa fica de fora.
 */
export type AddressSuggestion = Readonly<{
  city: string
  district: string
  label: string
  number: string
  point: GeoPoint | null
  postalCode: string
  state: string
  street: string
}>

export type AddressLookupInput = Readonly<{
  fetch: typeof globalThis.fetch
  signal: AbortSignal
  term: string
}>

const BRASIL_API_CEP_URL = 'https://brasilapi.com.br/api/cep/v2'
const VIA_CEP_URL = 'https://viacep.com.br/ws'
const PHOTON_URL = 'https://photon.komoot.io/api'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export const ADDRESS_SUGGESTION_LIMIT = 6

/** Termo curto casa com meia cidade: a busca só sai depois que há endereço reconhecível. */
export const ADDRESS_SEARCH_MINIMUM_LENGTH = 5

const NOMINATIM_STATE_KEY = 'ISO3166-2-lvl4'
const NOMINATIM_STATE_PREFIX = 'BR-'
const NOMINATIM_CITY_KEYS = ['city', 'town', 'village', 'municipality'] as const
const NOMINATIM_DISTRICT_KEYS = ['suburb', 'neighbourhood', 'city_district'] as const

/**
 * Photon devolve a UF pelo nome ("São Paulo"), e a API só aceita duas letras. O mapa é dado de
 * domínio, não texto de tela: traduzir isto no `*.locale.json` faria a sigla depender do idioma.
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

/** `Number('')` é zero, e zero é uma coordenada válida no Atlântico — string vazia não é número. */
function toCoordinate(value: unknown): null | number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (!isString(value) || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toPoint(latitude: unknown, longitude: unknown): GeoPoint | null {
  const parsedLatitude = toCoordinate(latitude)
  const parsedLongitude = toCoordinate(longitude)
  if (parsedLatitude === null || parsedLongitude === null) return null
  return { latitude: parsedLatitude, longitude: parsedLongitude }
}

function withoutAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}

export function toStateCode(value: string): string {
  const trimmed = value.trim()
  const upper = withoutAccents(trimmed).toUpperCase()
  if (upper.startsWith(NOMINATIM_STATE_PREFIX)) {
    return upper.slice(NOMINATIM_STATE_PREFIX.length)
  }
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

function fromBrasilApi(payload: unknown): AddressSuggestion | null {
  if (!isRecord(payload)) return null
  const coordinates = readRecord(readRecord(payload.location).coordinates)
  return buildSuggestion({
    city: readText(payload, 'city'),
    district: readText(payload, 'neighborhood'),
    number: '',
    point: toPoint(coordinates.latitude, coordinates.longitude),
    postalCode: stripPostalCode(readText(payload, 'cep')),
    state: toStateCode(readText(payload, 'state')),
    street: readText(payload, 'street'),
  })
}

/** O ViaCEP responde 200 com `{"erro": true}` para CEP inexistente — o status não acusa nada. */
function fromViaCep(payload: unknown): AddressSuggestion | null {
  if (!isRecord(payload) || payload.erro !== undefined) return null
  return buildSuggestion({
    city: readText(payload, 'localidade'),
    district: readText(payload, 'bairro'),
    number: '',
    point: null,
    postalCode: stripPostalCode(readText(payload, 'cep')),
    state: toStateCode(readText(payload, 'uf')),
    street: readText(payload, 'logradouro'),
  })
}

function fromPhotonFeature(feature: unknown): AddressSuggestion | null {
  if (!isRecord(feature)) return null
  const properties = readRecord(feature.properties)
  const [longitude, latitude] = toList(feature.geometry, 'coordinates')
  const street = readFirstText(properties, ['street', 'name'])
  return buildSuggestion({
    city: readFirstText(properties, ['city', 'town', 'village', 'county']),
    district: readFirstText(properties, ['district', 'suburb']),
    number: readText(properties, 'housenumber'),
    point: toPoint(latitude, longitude),
    postalCode: stripPostalCode(readText(properties, 'postcode')),
    state: toStateCode(readText(properties, 'state')),
    street,
  })
}

function fromNominatimPlace(place: unknown): AddressSuggestion | null {
  if (!isRecord(place)) return null
  const address = readRecord(place.address)
  const stateSource = readText(address, NOMINATIM_STATE_KEY)
  return buildSuggestion({
    city: readFirstText(address, NOMINATIM_CITY_KEYS),
    district: readFirstText(address, NOMINATIM_DISTRICT_KEYS),
    number: readText(address, 'house_number'),
    point: toPoint(place.lat, place.lon),
    postalCode: stripPostalCode(readText(address, 'postcode')),
    state: toStateCode(stateSource === '' ? readText(address, 'state') : stateSource),
    street: readFirstText(address, ['road', 'pedestrian', 'footway']),
  })
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

/** Rejeitar o vazio é o que faz `Promise.any` seguir para o provedor seguinte em vez de parar aqui. */
async function required(promise: Promise<AddressSuggestion | null>): Promise<AddressSuggestion> {
  const suggestion = await promise
  if (suggestion === null) throw new Error('ADDRESS_LOOKUP_EMPTY')
  return suggestion
}

export async function lookupPostalCode(
  input: AddressLookupInput,
): Promise<AddressSuggestion | null> {
  const digits = stripPostalCode(input.term)
  if (digits.length !== POSTAL_CODE_LENGTH) return null
  const { fetch, signal } = input
  try {
    return await Promise.any([
      required(
        readJson({ fetch, signal, url: `${BRASIL_API_CEP_URL}/${digits}` }).then(fromBrasilApi),
      ),
      required(readJson({ fetch, signal, url: `${VIA_CEP_URL}/${digits}/json/` }).then(fromViaCep)),
    ])
  } catch {
    return null
  }
}

function buildPhotonUrl(term: string): string {
  const query = new URLSearchParams({
    lang: 'pt',
    limit: String(ADDRESS_SUGGESTION_LIMIT),
    q: term,
  })
  return `${PHOTON_URL}?${query.toString()}`
}

function buildNominatimUrl(term: string): string {
  const query = new URLSearchParams({
    addressdetails: '1',
    countrycodes: 'br',
    format: 'jsonv2',
    limit: String(ADDRESS_SUGGESTION_LIMIT),
    q: term,
  })
  return `${NOMINATIM_URL}?${query.toString()}`
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
 * Dois provedores gratuitos e sem chave, porque um só cobre mal: o Photon acha rua por prefixo e
 * o Nominatim acha o número da casa. Provedor fora do ar não cancela a busca — só entrega menos.
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
    readJson({ fetch, signal, url: buildNominatimUrl(term) }).then((payload) =>
      toList(payload, 'results').map(fromNominatimPlace),
    ),
  ])
  const suggestions = responses.flatMap((response) =>
    response.status === 'fulfilled' ? response.value : [],
  )
  return dedupe(
    suggestions.filter((suggestion): suggestion is AddressSuggestion => suggestion !== null),
  )
}

/**
 * O ViaCEP não devolve coordenada, e ele ganha a corrida do CEP metade das vezes: sem este passo
 * o mapa apareceria ou não conforme qual provedor respondeu primeiro.
 */
export async function locateAddress(
  input: Readonly<{
    fetch: typeof globalThis.fetch
    signal: AbortSignal
    suggestion: AddressSuggestion
  }>,
): Promise<GeoPoint | null> {
  const { suggestion } = input
  if (suggestion.point !== null) return suggestion.point
  const term = [suggestion.street, suggestion.district, suggestion.city, suggestion.state]
    .filter((part) => part !== '')
    .join(', ')
  if (term === '') return null
  const results = await searchAddress({ fetch: input.fetch, signal: input.signal, term })
  return results.find((result) => result.point !== null)?.point ?? null
}

const MAP_SPAN_DEGREES = 0.004

/** Mapa por iframe do OpenStreetMap: sem dependência nova, sem chave e sem custo. */
export function buildMapEmbedUrl(point: GeoPoint): string {
  const west = point.longitude - MAP_SPAN_DEGREES
  const east = point.longitude + MAP_SPAN_DEGREES
  const south = point.latitude - MAP_SPAN_DEGREES
  const north = point.latitude + MAP_SPAN_DEGREES
  const query = new URLSearchParams({
    bbox: `${String(west)},${String(south)},${String(east)},${String(north)}`,
    layer: 'mapnik',
    marker: `${String(point.latitude)},${String(point.longitude)}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${query.toString()}`
}
