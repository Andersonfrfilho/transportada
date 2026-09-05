/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  GeocodeAddressRequest,
  GeocodeResult,
  GeocodingPort,
} from '../../routing/application/geocoding.port.js'
import { toGeocodingPrecision } from '../domain/google-location-type.policy.js'

/**
 * O provedor pago, e o **único** lugar do worker que fala com ele (ADR-0062).
 *
 * ⚠️ Ele não é registrado como `GeocodingPort` da cascata de sugestão, e não pode ser: lá o contrato
 * `paid-provider-never-called.contract.ts` cobra zero chamadas pagas. Aqui a porta é a mesma só
 * porque o vocabulário é o mesmo — quem escolhe o adaptador é a fiação em `main.ts`.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/routing/infrastructure/google-geocoding.gateway.ts`:
 * as duas apps não importam código uma da outra. `test/geocoding-refine/google-parity.contract.ts`
 * compara os dois arquivos — divergirem significa a mesma resposta do Google virando precisão
 * diferente conforme quem perguntou, que é o pior tipo de defeito para depurar.
 */
type GoogleGeocodingResponse = Readonly<{
  results?: readonly Readonly<{
    geometry?: Readonly<{
      location?: Readonly<{ lat?: unknown; lng?: unknown }>
      location_type?: unknown
    }>
    place_id?: unknown
  }>[]
  status?: unknown
}>

export type GoogleGeocodingGatewayInput = Readonly<{
  apiKey: string
  baseUrl?: string
  fetchImplementation?: typeof fetch
  timeoutMilliseconds?: number
}>

const DEFAULT_BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000
const COORDINATE_SCALE = 7

export function createGoogleGeocodingGateway(input: GoogleGeocodingGatewayInput): GeocodingPort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const baseUrl = input.baseUrl ?? DEFAULT_BASE_URL
  const timeout = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async geocode(request: GeocodeAddressRequest): Promise<GeocodeResult> {
      const parameters = new URLSearchParams({
        address: toSingleLineAddress(request),
        components: `country:BR|postal_code:${request.postalCode}`,
        key: input.apiKey,
      })

      const body = await readBody(
        `${baseUrl}?${parameters.toString()}`,
        fetchImplementation,
        timeout,
      )
      if (body.cause !== null) return { cause: body.cause, coordinate: null }
      if (body.payload.status !== 'OK') return { cause: 'not_found', coordinate: null }

      const [result] = body.payload.results ?? []
      const latitude = toCoordinate(result?.geometry?.location?.lat)
      const longitude = toCoordinate(result?.geometry?.location?.lng)
      const placeId = typeof result?.place_id === 'string' ? result.place_id.trim() : ''
      if (latitude === null || longitude === null)
        return { cause: 'no_coordinate', coordinate: null }

      /**
       * ADR-0044 §3, mitigação 1: sem `place_id` o CHECK `geocoded_addresses_place_id_check`
       * recusaria a linha `google`. Melhor não resolver que tentar gravar quebrado.
       */
      if (placeId.length === 0) return { cause: 'no_coordinate', coordinate: null }

      return {
        cause: null,
        coordinate: {
          externalPlaceId: placeId,
          latitude,
          longitude,
          precision: toGeocodingPrecision(String(result?.geometry?.location_type ?? '')),
          source: 'google',
        },
      }
    },
  }
}

type BodyRead =
  | Readonly<{ cause: null; payload: GoogleGeocodingResponse }>
  | Readonly<{ cause: 'not_found' | 'transport_error'; payload: null }>

async function readBody(
  url: string,
  fetchImplementation: typeof fetch,
  timeoutMilliseconds: number,
): Promise<BodyRead> {
  try {
    const response = await fetchImplementation(url, {
      signal: AbortSignal.timeout(timeoutMilliseconds),
    })
    if (!response.ok) return { cause: 'not_found', payload: null }

    return { cause: null, payload: (await response.json()) as GoogleGeocodingResponse }
  } catch {
    /**
     * RNF1: nada do endereço vai para log. E a causa importa mais aqui do que no degrau gratuito:
     * `transport_error` é o que **adia** em vez de queimar a única chance paga do endereço.
     */
    return { cause: 'transport_error', payload: null }
  }
}

/** O provedor resolve endereço mal formatado, que é o que chega no XML da NF-e (ADR-0044 §3). */
function toSingleLineAddress(request: GeocodeAddressRequest): string {
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

/**
 * A coordenada é guardada como **texto**: a coluna é `numeric`, e devolver o número do JSON deixaria
 * a representação decimal na mão do `toString` do runtime.
 */
function toCoordinate(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  return value.toFixed(COORDINATE_SCALE)
}
