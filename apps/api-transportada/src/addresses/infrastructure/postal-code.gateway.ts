/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PostalCodeProviderPort,
  PostalCodeProviderQuery,
} from '../application/postal-code.port.js'
import { raceCompletePostalCodeSuggestion } from '../application/postal-code-race.service.js'
import { buildGooglePostalCodeTarget, readGooglePostalCode } from './google-postal-code.mapper.js'
import {
  type PostalCodeSuggestion,
  toPostalCodeSuggestion,
} from '../domain/postal-code-suggestion.policy.js'

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export type PostalCodeGatewayConfiguration = {
  readonly awesomeApiUrl: string | undefined
  readonly brasilApiUrl: string | undefined
  /** Pago por chamada: presente, o Google corre junto com os gratuitos em todo CEP (spec 186). */
  readonly googleApiKey: string | undefined
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

/** A AwesomeAPI já manda o tipo no logradouro (`address` = "Rua …"); `address_name` viria sem ele. */
const readAwesomeApi = (payload: unknown): PostalCodeSuggestion | null => {
  if (!isRecord(payload)) {
    return null
  }

  return toPostalCodeSuggestion({
    city: readString(payload.city),
    district: readString(payload.district),
    state: readStateCode(payload.state),
    street: readString(payload.address),
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
  if (configuration.awesomeApiUrl !== undefined) {
    providers.push({ read: readAwesomeApi, target: `${configuration.awesomeApiUrl}/${postalCode}` })
  }
  if (configuration.googleApiKey !== undefined) {
    providers.push({
      read: (payload) => readGooglePostalCode({ payload, postalCode }),
      target: buildGooglePostalCodeTarget({ apiKey: configuration.googleApiKey, postalCode }),
    })
  }
  if (configuration.viaCepUrl !== undefined) {
    providers.push({ read: readViaCep, target: `${configuration.viaCepUrl}/${postalCode}/json/` })
  }

  return providers
}

type ReadProviderParams = {
  readonly fetch: Fetch
  readonly provider: Provider
  readonly signal: AbortSignal
}

/**
 * Falha de rede, status ruim, corpo inesperado e aborto por ter perdido a corrida são a mesma coisa
 * aqui — nada disso é defeito nosso, e o operador segue digitando.
 */
async function readProvider({
  fetch,
  provider,
  signal,
}: ReadProviderParams): Promise<PostalCodeSuggestion | null> {
  try {
    const response = await fetch(provider.target, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS)]),
    })
    if (!response.ok) {
      return null
    }

    return provider.read(await response.json())
  } catch {
    return null
  }
}

/**
 * Os provedores correm juntos (spec 186) e o primeiro endereço completo encerra a corrida: os que
 * ainda estão no ar são abortados. A ordem da lista só desempata parciais.
 */
export function createPostalCodeGateway({
  configuration,
  fetch,
}: CreatePostalCodeGatewayParams): PostalCodeProviderPort {
  return {
    async findByPostalCode({ postalCode }: PostalCodeProviderQuery) {
      const race = new AbortController()
      try {
        return await raceCompletePostalCodeSuggestion(
          buildProviders(configuration, postalCode).map(
            (provider) => () => readProvider({ fetch, provider, signal: race.signal }),
          ),
        )
      } finally {
        race.abort()
      }
    },
  }
}
