/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  GeocodeAddressRequest,
  GeocodeFailureCause,
  GeocodeResult,
  GeocodingPort,
} from '../application/geocoding.port.js'

/**
 * O degrau 1 da escada (adendo 2026-09-01 da ADR-0044): a BrasilAPI `/cep/v2`.
 *
 * ⚠️ Ele **não abre destino externo novo e não paga chamada nova**: é o mesmo endpoint que a API já
 * consulta em `postal-code.gateway.ts` para preencher os campos de endereço, e o
 * `location.coordinates` vem no mesmo corpo que ela hoje descarta. Medido em 2026-09-01.
 *
 * Nunca lança: o degrau que não resolve devolve `null` e quem chama desce a cascata. Serviço público
 * e gratuito recusa por volume, e recusa esperada não é defeito nosso.
 */
type BrasilApiCepResponse = Readonly<{
  location?: Readonly<{
    coordinates?: Readonly<{ latitude?: unknown; longitude?: unknown }>
  }>
  street?: unknown
}>

export type BrasilApiPostalCodeGatewayInput = Readonly<{
  baseUrl: string
  fetchImplementation?: typeof fetch
  timeoutMilliseconds?: number
}>

const DEFAULT_TIMEOUT_MILLISECONDS = 10_000
const POSTAL_CODE_LENGTH = 8

export function createBrasilApiPostalCodeGateway(
  input: BrasilApiPostalCodeGatewayInput,
): GeocodingPort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const timeout = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async geocode(request: GeocodeAddressRequest): Promise<GeocodeResult> {
      if (input.baseUrl.trim().length === 0) return failed('not_configured')

      const postalCode = canonicalPostalCode(request.postalCode)
      if (postalCode === null) return failed('invalid_postal_code')

      const body = await readBody(`${input.baseUrl}/${postalCode}`, fetchImplementation, timeout)
      if (body.cause !== null) return failed(body.cause)

      const latitude = asCoordinate(body.payload.location?.coordinates?.latitude)
      const longitude = asCoordinate(body.payload.location?.coordinates?.longitude)
      /** O `/cep/v2` responde por vários serviços a montante, e nem todos devolvem coordenada. */
      if (latitude === null || longitude === null) return failed('no_coordinate')

      /**
       * RF9. Cidade pequena tem **um CEP para o município inteiro**, e a coordenada dele é palpite de
       * quilômetros. Gravá-la como `postal_code` a poria dentro da rota, que é o modo de falha da
       * ADR-0044 §1 — número plausível, sem aviso.
       *
       * O sinal é o `street` ausente, e não o sufixo `-000`: `14801-000` é a Avenida Presidente
       * Vargas de Araraquara, logradouro. CEP geral não tem logradouro por definição; CEP de
       * logradouro sempre tem.
       */
      const isWholeMunicipality = asText(body.payload.street).length === 0

      return {
        cause: null,
        coordinate: {
          /** Vazio: o `place_id` é do pago, e o CHECK só o exige de linha `google`. */
          externalPlaceId: '',
          latitude,
          longitude,
          precision: isWholeMunicipality ? 'city' : 'postal_code',
          source: isWholeMunicipality ? 'city' : 'postal_code',
        },
      }
    },
  }
}

type BodyRead =
  | Readonly<{ cause: null; payload: BrasilApiCepResponse }>
  | Readonly<{ cause: GeocodeFailureCause; payload: null }>

async function readBody(
  url: string,
  fetchImplementation: typeof fetch,
  timeoutMilliseconds: number,
): Promise<BodyRead> {
  try {
    const response = await fetchImplementation(url, {
      signal: AbortSignal.timeout(timeoutMilliseconds),
    })
    /**
     * `404` e `429` viram a mesma causa de propósito: para quem chama, os dois significam "este CEP
     * não resolveu agora". Separá-los aqui exigiria o gateway opinar sobre política de retentativa,
     * que é decisão de quem chama — e a contagem por causa já distingue isto de erro de transporte.
     */
    if (!response.ok) return { cause: 'not_found', payload: null }

    return { cause: null, payload: (await response.json()) as BrasilApiCepResponse }
  } catch {
    /** RNF1: **a causa vai, o endereço não**. É a distinção que faltava. */
    return { cause: 'transport_error', payload: null }
  }
}

function failed(cause: GeocodeFailureCause): GeocodeResult {
  return { cause, coordinate: null }
}

function canonicalPostalCode(postalCode: string): string | null {
  const digits = postalCode.replace(/\D/gu, '')

  return digits.length === POSTAL_CODE_LENGTH ? digits : null
}

/**
 * O provedor devolve a coordenada como **texto**, e é assim que ela é guardada: a coluna é `numeric`
 * e passar por `Number` traria erro binário para dentro de dado que é comparado e exibido.
 */
function asCoordinate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 && Number.isFinite(Number(trimmed)) ? trimmed : null
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
