/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodeAddressRequest } from '../../routing/application/geocoding.port.js'
import type { PlaceLookupPort, PlaceLookupResult } from '../application/place-lookup.port.js'

/**
 * A **Places API (New)**, `places:searchText` — o degrau 2b da ADR-0062.
 *
 * ⚠️ **Não é a Geocoding com outro nome, e a diferença é medida.** A Geocoding tolera **um** erro de
 * grafia no logradouro e desiste com dois: `R AMERICA DE ARAUJO PERES` (cadastro) contra
 * `R. Américo de Araújo Píres` (real) devolve `APPROXIMATE`, o centro do município, 6 km fora.
 * Corrigir uma única letra devolve `ROOFTOP`. A Places acha o lugar com os dois erros.
 *
 * ⚠️ **A legada não serve**: `maps/api/place/textsearch` responde `REQUEST_DENIED` para projeto que
 * não a usava antes — o Google não aceita mais projetos nela. É a `places.googleapis.com/v1`.
 *
 * O `FieldMask` é obrigatório e é **orçamento**: pedir campo a mais sobe a faixa de cobrança. Aqui
 * são os quatro que a decisão precisa — onde é, e o que responder às guardas (número e município).
 */
type PlacesAddressComponent = Readonly<{
  longText?: unknown
  types?: readonly unknown[]
}>

type PlacesResponse = Readonly<{
  places?: readonly Readonly<{
    addressComponents?: readonly PlacesAddressComponent[]
    id?: unknown
    location?: Readonly<{ latitude?: unknown; longitude?: unknown }>
  }>[]
}>

export type GooglePlacesGatewayInput = Readonly<{
  apiKey: string
  baseUrl?: string
  fetchImplementation?: typeof fetch
  timeoutMilliseconds?: number
}>

const DEFAULT_BASE_URL = 'https://places.googleapis.com/v1/places:searchText'
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000
const COORDINATE_SCALE = 7
const FIELD_MASK = 'places.id,places.location,places.addressComponents'

/**
 * ⚠️ **No Brasil o município é `administrative_area_level_2`, não `locality`.** Medido em
 * 2026-09-05: Luís Antônio volta como `administrative_area_level_2`, e o campo `locality` não existe
 * na resposta.
 *
 * A primeira versão daqui pedia só `locality` — e o efeito não era um erro, era a guarda de
 * município **desligada em silêncio**: `cityName` vinha vazio, e a política trata vazio como "o
 * provedor não nomeou o município", que aceita. Guarda que falha aberta é pior que guarda nenhuma,
 * porque ninguém procura por ela.
 *
 * A ordem é preferência: `locality` fica como queda porque capital e município que também são
 * cidade a preenchem.
 */
const CITY_TYPES = ['administrative_area_level_2', 'locality'] as const

export function createGooglePlacesGateway(input: GooglePlacesGatewayInput): PlaceLookupPort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const baseUrl = input.baseUrl ?? DEFAULT_BASE_URL
  const timeout = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async lookup(request: GeocodeAddressRequest): Promise<PlaceLookupResult> {
      if (input.apiKey.trim().length === 0) return { cause: 'not_configured', place: null }

      let body: PlacesResponse
      try {
        const response = await fetchImplementation(baseUrl, {
          body: JSON.stringify({
            maxResultCount: 1,
            regionCode: 'BR',
            textQuery: toTextQuery(request),
          }),
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': input.apiKey,
            'x-goog-fieldmask': FIELD_MASK,
          },
          method: 'POST',
          signal: AbortSignal.timeout(timeout),
        })
        /**
         * ⚠️ Recusa do provedor **não** é ausência de endereço: API desabilitada no projeto responde
         * `PERMISSION_DENIED`, e tratá-la como "não achei" carimbaria `paid_refined_at` sem ter
         * perguntado nada. Ela adia, como qualquer falha de transporte.
         */
        if (!response.ok) return { cause: 'transport_error', place: null }

        body = (await response.json()) as PlacesResponse
      } catch {
        /** RNF1: a causa vai, o endereço não. */
        return { cause: 'transport_error', place: null }
      }

      const [place] = body.places ?? []
      /** Rua inventada devolve lista vazia — a recusa que torna este degrau seguro. */
      if (place === undefined) return { cause: 'no_result', place: null }

      const latitude = toCoordinate(place.location?.latitude)
      const longitude = toCoordinate(place.location?.longitude)
      const placeId = typeof place.id === 'string' ? place.id.trim() : ''
      if (latitude === null || longitude === null || placeId.length === 0) {
        return { cause: 'no_result', place: null }
      }

      return {
        cause: null,
        place: {
          cityName: componentOf(place.addressComponents, CITY_TYPES),
          latitude,
          longitude,
          placeId,
          streetNumber: componentOf(place.addressComponents, ['street_number']),
        },
      }
    },
  }
}

/**
 * O texto vai **como a nota o escreveu**, erros inclusive: é justamente a tolerância a eles que faz
 * este degrau existir. Corrigir aqui seria adivinhar, e adivinhação vira coordenada de outro lugar.
 */
function toTextQuery(request: GeocodeAddressRequest): string {
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

function componentOf(
  components: readonly PlacesAddressComponent[] | undefined,
  wanted: readonly string[],
): string {
  for (const type of wanted) {
    for (const component of components ?? []) {
      const types = Array.isArray(component.types) ? component.types : []
      if (!types.includes(type)) continue

      const text = typeof component.longText === 'string' ? component.longText.trim() : ''
      if (text.length > 0) return text
    }
  }

  return ''
}

/** Texto, não número: a coluna é `numeric`, e o `toString` do runtime não decide a representação. */
function toCoordinate(value: unknown): null | string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  return value.toFixed(COORDINATE_SCALE)
}
