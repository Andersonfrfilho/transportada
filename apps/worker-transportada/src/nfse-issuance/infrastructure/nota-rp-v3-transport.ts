/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { classifyTransportError } from './nota-rp-v3-envelope.js'
import type {
  NotaRpV3Dependencies,
  NotaRpV3RequestParams,
  NotaRpV3TransportResult,
} from './nota-rp-v3.types.js'

const API_PATH_PREFIX = '/api/v3'
export const JSON_MEDIA_TYPE = 'application/json'
/** Só pontuação cai: o CNPJ alfanumérico mantém as letras. */
const PUNCTUATION = /[.\-/\s]/gu

export function stripPunctuation(value: string): string {
  return value.replace(PUNCTUATION, '')
}

/**
 * A mesma `NFSE_PROVIDER_BASE_URL` serve à v2 (`.../api/v2`) e à v3: só a origem interessa, e o
 * prefixo `/api/v3` é acrescentado aqui.
 */
function readOrigin(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).origin
  } catch {
    return undefined
  }
}

export function createNotaRpV3Transport(
  dependencies: Pick<NotaRpV3Dependencies, 'config' | 'fetch'>,
): {
  readonly request: (params: NotaRpV3RequestParams) => Promise<NotaRpV3TransportResult>
} {
  const { config, fetch } = dependencies
  const origin = readOrigin(config.baseUrl)
  const authHeaders = {
    'X-Auth-CNPJ': stripPunctuation(config.taxId),
    'X-Auth-IM': stripPunctuation(config.municipalRegistration),
    'X-Auth-User-Token': config.token,
  }

  return {
    request: async (params) => {
      if (origin === undefined) return { cause: 'transport_failure', kind: 'error' }

      const url = new URL(`${origin}${API_PATH_PREFIX}${params.path}`)
      for (const [name, value] of Object.entries(params.query ?? {})) {
        url.searchParams.set(name, value)
      }

      try {
        const response = await fetch(url.toString(), {
          headers: {
            ...authHeaders,
            accept: params.accept,
            ...(params.body === undefined ? {} : { 'content-type': JSON_MEDIA_TYPE }),
          },
          method: params.method,
          signal: AbortSignal.timeout(config.timeoutMilliseconds),
          ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
        })
        return { kind: response.ok ? 'response' : 'http', response }
      } catch (error: unknown) {
        return { cause: classifyTransportError(error), kind: 'error' }
      }
    },
  }
}
