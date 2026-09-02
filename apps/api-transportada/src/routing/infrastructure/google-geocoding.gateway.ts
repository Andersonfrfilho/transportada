/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { toGeocodingPrecision } from '../domain/geocoding-precision.policy.js'
import type {
  GeocodeAddressRequest,
  GeocodedCoordinate,
  GeocodingPort,
} from '../application/geocoding.port.js'

/**
 * O degrau 2 da escada (adendo 2026-09-01 da ADR-0044): a precisão fina, comprada **só quando um
 * humano marca** a parada como errada. Nenhum gatilho automático chega aqui — e há um contrato
 * cobrando isso, porque a escalada automática é tentadora e a fatura não avisa.
 *
 * ⚠️ Este é o arquivo que a T006 da spec 058 listou e **nunca foi escrito**, com a task marcada
 * concluída. O aceite dela era satisfeito pela política pura, que é testável sem provedor.
 *
 * Nunca lança: o que não resolve devolve `null`, e a marca responde "não melhorou" oferecendo o pino
 * manual — em vez de estourar na cara de quem clicou.
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
    async geocode(request: GeocodeAddressRequest): Promise<GeocodedCoordinate | null> {
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
      if (body === null || body.status !== 'OK') return null

      const [result] = body.results ?? []
      const latitude = toCoordinate(result?.geometry?.location?.lat)
      const longitude = toCoordinate(result?.geometry?.location?.lng)
      const placeId = typeof result?.place_id === 'string' ? result.place_id.trim() : ''
      if (latitude === null || longitude === null) return null

      /**
       * ADR-0044 §3, mitigação 1: sem `place_id` o CHECK `geocoded_addresses_place_id_check`
       * recusaria a linha `google`. Melhor não resolver que tentar gravar quebrado — e a mitigação
       * que a ADR chamou de saída barata continua valendo para toda linha que existir.
       */
      if (placeId.length === 0) return null

      return {
        externalPlaceId: placeId,
        latitude,
        longitude,
        precision: toGeocodingPrecision(String(result?.geometry?.location_type ?? '')),
        source: 'google',
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
    /** RNF1: nada do endereço vai para log — nem aqui, onde a causa seria tentadora de registrar. */
    return null
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
