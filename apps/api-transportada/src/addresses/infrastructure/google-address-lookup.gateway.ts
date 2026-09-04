/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AddressLookupPort,
  AddressLookupRequest,
  AddressLookupResult,
} from '../application/address-lookup.port.js'
import { extractProviderAddress, toProviderMatchLevel } from '../domain/provider-address.policy.js'

/**
 * A busca textual do lote de medição (**ADR-0061**, spec 084 G5).
 *
 * ⚠️ **Não é o gateway do degrau 2 com outro nome.** Aquele filtra por `postal_code` de propósito:
 * quer a coordenada mais fina daquele CEP. Aqui o filtro seria fatal — ele **obriga** o provedor a
 * concordar com o nosso CEP, e a divergência de CEP é o achado de maior valor do relatório, porque
 * devolve o endereço ao degrau 1, que é grátis. Filtrar seria apagar o sinal antes de medi-lo.
 *
 * O que se filtra é o **lugar**: país e UF, que são nossos e confiáveis, e impedem que uma "Rua 7 de
 * Setembro" de outro estado volte com `rooftop`. O município fica de fora do filtro por decisão —
 * quem o confere é `checkCityMatch`, pelo código IBGE, e um filtro por nome recusaria a grafia que a
 * nota trouxe justamente quando ela está errada, que é o caso que se quer ver.
 */
type GoogleGeocodingResponse = Readonly<{
  results?: readonly Readonly<{
    address_components?: unknown
    geometry?: Readonly<{
      location?: Readonly<{ lat?: unknown; lng?: unknown }>
      location_type?: unknown
    }>
    place_id?: unknown
  }>[]
  status?: unknown
}>

export type GoogleAddressLookupGatewayInput = Readonly<{
  apiKey: string
  baseUrl?: string
  fetchImplementation?: typeof fetch
  timeoutMilliseconds?: number
}>

const DEFAULT_BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000
const COORDINATE_SCALE = 7

/** Perguntou e não havia — resultado legítimo, e a linha mais acionável do relatório. */
const EMPTY_RESULT: AddressLookupResult = {
  address: { cityName: '', district: '', number: '', postalCode: '', state: '', street: '' },
  latitude: null,
  longitude: null,
  matchLevel: 'not_found',
  placeId: '',
}

export function createGoogleAddressLookupGateway(
  input: GoogleAddressLookupGatewayInput,
): AddressLookupPort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const baseUrl = input.baseUrl ?? DEFAULT_BASE_URL
  const timeout = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async lookup(request: AddressLookupRequest): Promise<AddressLookupResult | null> {
      const parameters = new URLSearchParams({
        address: toSingleLineAddress(request),
        components: toPlaceFilter(request),
        key: input.apiKey,
      })

      const body = await readBody(
        `${baseUrl}?${parameters.toString()}`,
        fetchImplementation,
        timeout,
      )
      if (body === null) return null

      const status = String(body.status ?? '')
      if (status === 'ZERO_RESULTS') return EMPTY_RESULT
      /** Cota estourada, chave recusada, pedido malformado: não é ausência de endereço. */
      if (status !== 'OK') return null

      const [result] = body.results ?? []
      if (result === undefined) return EMPTY_RESULT

      const components = Array.isArray(result.address_components) ? result.address_components : []

      return {
        address: extractProviderAddress(components),
        latitude: toCoordinate(result.geometry?.location?.lat),
        longitude: toCoordinate(result.geometry?.location?.lng),
        matchLevel: toProviderMatchLevel(
          typeof result.geometry?.location_type === 'string' ? result.geometry.location_type : null,
        ),
        placeId: typeof result.place_id === 'string' ? result.place_id.trim() : '',
      }
    },
  }
}

async function readBody(
  url: string,
  fetchImplementation: typeof fetch,
  timeoutMilliseconds: number,
): Promise<GoogleGeocodingResponse | null> {
  try {
    const response = await fetchImplementation(url, {
      signal: AbortSignal.timeout(timeoutMilliseconds),
    })
    if (!response.ok) return null

    return (await response.json()) as GoogleGeocodingResponse
  } catch {
    /** RNF1: nada do endereço sai daqui — nem para registrar a causa, que seria tentador. */
    return null
  }
}

/**
 * RF12: os seis campos viajam. O CEP **não melhora** a busca — medido em 2026-09-04 — e vai junto
 * para que o que volta possa ser comparado com ele.
 */
function toSingleLineAddress(request: AddressLookupRequest): string {
  return [
    [request.street, request.number].filter((part) => part.length > 0).join(', '),
    request.district,
    request.city,
    request.state,
    request.postalCode,
  ]
    .filter((part) => part.length > 0)
    .join(' - ')
}

function toPlaceFilter(request: AddressLookupRequest): string {
  const state = request.state.trim()

  return state.length === 0 ? 'country:BR' : `country:BR|administrative_area:${state}`
}

/** Texto, não número: a coluna é `numeric`, e o `toString` do runtime não decide a representação. */
function toCoordinate(value: unknown): null | string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  return value.toFixed(COORDINATE_SCALE)
}
