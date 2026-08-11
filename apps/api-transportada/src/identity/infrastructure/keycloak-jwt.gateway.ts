/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  createKeycloakJwtVerifier,
  type KeycloakJwtVerifier,
  type KeycloakJwtVerifierConfig,
  KeycloakJwtVerificationError,
} from '@adatechnology/keycloak-jwt'

import {
  AccessTokenRejectedError,
  type AccessTokenVerifierPort,
  type IdentityReadinessPort,
} from '../application/identity.port'

type KeycloakAccessTokenVerifierConfig = {
  readonly audience: string
  readonly issuer: string
  readonly jwksUri: string
}

/** Só o que a readiness pede. `typeof globalThis.fetch` arrastaria `preconnect` para todo dublê. */
export type FetchResource = (input: string, init?: RequestInit) => Promise<Response>

type KeycloakAccessTokenVerifierDependencies = {
  readonly createVerifier: (config: KeycloakJwtVerifierConfig) => KeycloakJwtVerifier
  readonly fetch?: FetchResource
}

const defaultDependencies: KeycloakAccessTokenVerifierDependencies = {
  createVerifier: createKeycloakJwtVerifier,
}

/**
 * O `/certs` é servido de memória: ele responde 200 com o Keycloak sem alcançar o banco, e foi assim
 * que uma queda total de login passou horas com a identidade marcada `up`. O documento de descoberta
 * lê a configuração do realm no banco, então cai junto com a dependência que interessa.
 */
const DISCOVERY_PATH = '/.well-known/openid-configuration'
/** Identidade lenta pendurando o healthcheck vira timeout no monitor, que é ruído — não `down`. */
const READINESS_TIMEOUT_MS = 2_000

export function createKeycloakAccessTokenVerifier(
  config: KeycloakAccessTokenVerifierConfig,
  dependencies: KeycloakAccessTokenVerifierDependencies = defaultDependencies,
): AccessTokenVerifierPort & IdentityReadinessPort {
  const fetchResource: FetchResource =
    dependencies.fetch ?? (async (input, init) => await globalThis.fetch(input, init))
  const verifier = dependencies.createVerifier({
    algorithms: ['RS256'],
    audience: config.audience,
    issuer: config.issuer,
    jwksUri: config.jwksUri,
    requiredClaims: ['company_id'],
  })

  return {
    async checkReadiness() {
      try {
        const response = await fetchResource(`${config.issuer}${DISCOVERY_PATH}`, {
          signal: AbortSignal.timeout(READINESS_TIMEOUT_MS),
        })
        return response.ok
      } catch {
        return false
      }
    },
    async verify(token) {
      try {
        return await verifier.verify(token)
      } catch (error: unknown) {
        if (error instanceof KeycloakJwtVerificationError) {
          throw new AccessTokenRejectedError()
        }
        throw error
      }
    },
  }
}
