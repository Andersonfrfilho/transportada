/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PostalCodeProviderPort,
  PostalCodeProviderQuery,
} from '../application/postal-code.port.js'
import {
  type PostalCodeSuggestion,
  toPostalCodeSuggestion,
} from '../domain/postal-code-suggestion.policy.js'

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export type PostalCodeGatewayConfiguration = {
  readonly brasilApiUrl: string | undefined
  readonly viaCepUrl: string | undefined
}

export type CreatePostalCodeGatewayParams = {
  readonly configuration: PostalCodeGatewayConfiguration
  readonly fetch: Fetch
}

type Provider = {
  readonly read: (payload: unknown) => PostalCodeSuggestion | null
  readonly target: string
}

const REQUEST_TIMEOUT_IN_MILLISECONDS = 4_000
const STATE_CODE_PATTERN = /^[A-Z]{2}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readString = (value: unknown): string => (typeof value === 'string' ? value : '')

/** UF é sigla de duas letras: nome inteiro é resposta que não cabe no campo do formulário. */
const readStateCode = (value: unknown): string => {
  const candidate = readString(value).trim().toUpperCase()
  return STATE_CODE_PATTERN.test(candidate) ? candidate : ''
}

const readBrasilApi = (payload: unknown): PostalCodeSuggestion | null => {
  if (!isRecord(payload)) {
    return null
  }

  return toPostalCodeSuggestion({
    city: readString(payload.city),
    district: readString(payload.neighborhood),
    state: readStateCode(payload.state),
    street: readString(payload.street),
  })
}

/** O ViaCEP responde 200 com `{"erro": true}` para CEP inexistente — o status não acusa nada. */
const readViaCep = (payload: unknown): PostalCodeSuggestion | null => {
  if (!isRecord(payload) || payload.erro !== undefined) {
    return null
  }

  return toPostalCodeSuggestion({
    city: readString(payload.localidade),
    district: readString(payload.bairro),
    state: readStateCode(payload.uf),
    street: readString(payload.logradouro),
  })
}

const buildProviders = (
  configuration: PostalCodeGatewayConfiguration,
  postalCode: string,
): readonly Provider[] => {
  const providers: Provider[] = []
  if (configuration.brasilApiUrl !== undefined) {
    providers.push({ read: readBrasilApi, target: `${configuration.brasilApiUrl}/${postalCode}` })
  }
  if (configuration.viaCepUrl !== undefined) {
    providers.push({ read: readViaCep, target: `${configuration.viaCepUrl}/${postalCode}/json/` })
  }

  return providers
}

/**
 * Os provedores são consultados **em sequência**, não em corrida: eles são de terceiros e a nossa
 * política é gastar a chamada do segundo só quando o primeiro não soube. Falha de rede, status ruim e
 * corpo inesperado são a mesma coisa aqui — nada disso é defeito nosso, e o operador segue digitando.
 */
async function readProvider(
  fetch: Fetch,
  { read, target }: Provider,
): Promise<PostalCodeSuggestion | null> {
  try {
    const response = await fetch(target, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS),
    })
    if (!response.ok) {
      return null
    }

    return read(await response.json())
  } catch {
    return null
  }
}

export function createPostalCodeGateway({
  configuration,
  fetch,
}: CreatePostalCodeGatewayParams): PostalCodeProviderPort {
  return {
    async findByPostalCode({ postalCode }: PostalCodeProviderQuery) {
      for (const provider of buildProviders(configuration, postalCode)) {
        const suggestion = await readProvider(fetch, provider)
        if (suggestion !== null) {
          return suggestion
        }
      }

      return null
    },
  }
}
