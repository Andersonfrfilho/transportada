/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  GeocodeAddressRequest,
  GeocodedCoordinate,
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
    async geocode(request: GeocodeAddressRequest): Promise<GeocodedCoordinate | null> {
      const postalCode = canonicalPostalCode(request.postalCode)
      if (postalCode === null) return null

      const body = await readBody(`${input.baseUrl}/${postalCode}`, fetchImplementation, timeout)
      if (body === null) return null

      const latitude = asCoordinate(body.location?.coordinates?.latitude)
      const longitude = asCoordinate(body.location?.coordinates?.longitude)
      if (latitude === null || longitude === null) return null

      /**
       * RF9. Cidade pequena tem **um CEP para o município inteiro**, e a coordenada dele é palpite de
       * quilômetros. Gravá-la como `postal_code` a poria dentro da rota, que é o modo de falha da
       * ADR-0044 §1 — número plausível, sem aviso.
       *
       * O sinal é o `street` ausente, e não o sufixo `-000`: `14801-000` é a Avenida Presidente
       * Vargas de Araraquara, logradouro. CEP geral não tem logradouro por definição; CEP de
       * logradouro sempre tem.
       */
      const isWholeMunicipality = asText(body.street).length === 0

      return {
        /** Vazio: o `place_id` é do provedor pago, e o CHECK da tabela só o exige de linha `google`. */
        externalPlaceId: '',
        latitude,
        longitude,
        precision: isWholeMunicipality ? 'city' : 'postal_code',
        source: isWholeMunicipality ? 'city' : 'postal_code',
      }
    },
  }
}

async function readBody(
  url: string,
  fetchImplementation: typeof fetch,
  timeoutMilliseconds: number,
): Promise<BrasilApiCepResponse | null> {
  try {
    const response = await fetchImplementation(url, {
      signal: AbortSignal.timeout(timeoutMilliseconds),
    })
    if (!response.ok) return null

    return (await response.json()) as BrasilApiCepResponse
  } catch {
    /** RNF1: nada do endereço vai para log — nem aqui, onde a causa seria tentadora de registrar. */
    return null
  }
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
