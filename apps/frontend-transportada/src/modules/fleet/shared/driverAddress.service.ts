/* Copyright (c) 2026 Ada Technology. MIT License. */
import { POSTAL_CODE_LENGTH, stripPostalCode } from '@/modules/shared/postalCode.service'

import { BRAZIL_STATE } from './fleet.types'
import { isRecord, isString } from './fleetGuards.validation'

/**
 * Um endereço resolvido por um provedor externo, já no vocabulário do formulário. Sem coordenada:
 * a ADR-0037 tirou o mapa, e com ele a única coisa que consumia latitude e longitude.
 */
export type AddressSuggestion = Readonly<{
  city: string
  district: string
  label: string
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

const BRASIL_API_CEP_URL = 'https://brasilapi.com.br/api/cep/v2'
const VIA_CEP_URL = 'https://viacep.com.br/ws'
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

function fromBrasilApi(payload: unknown): AddressSuggestion | null {
  if (!isRecord(payload)) return null
  return buildSuggestion({
    city: readText(payload, 'city'),
    district: readText(payload, 'neighborhood'),
    number: '',
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
    postalCode: stripPostalCode(readText(payload, 'cep')),
    state: toStateCode(readText(payload, 'uf')),
    street: readText(payload, 'logradouro'),
  })
}

function fromPhotonFeature(feature: unknown): AddressSuggestion | null {
  if (!isRecord(feature)) return null
  const properties = readRecord(feature.properties)
  const street = readFirstText(properties, ['street', 'name'])
  return buildSuggestion({
    city: readFirstText(properties, ['city', 'town', 'village', 'county']),
    district: readFirstText(properties, ['district', 'suburb']),
    number: readText(properties, 'housenumber'),
    postalCode: stripPostalCode(readText(properties, 'postcode')),
    state: toStateCode(readText(properties, 'state')),
    street,
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
