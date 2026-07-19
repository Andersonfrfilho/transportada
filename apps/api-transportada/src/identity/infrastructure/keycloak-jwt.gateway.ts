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

type KeycloakAccessTokenVerifierDependencies = {
  readonly createVerifier: (config: KeycloakJwtVerifierConfig) => KeycloakJwtVerifier
}

const defaultDependencies: KeycloakAccessTokenVerifierDependencies = {
  createVerifier: createKeycloakJwtVerifier,
}

export function createKeycloakAccessTokenVerifier(
  config: KeycloakAccessTokenVerifierConfig,
  dependencies: KeycloakAccessTokenVerifierDependencies = defaultDependencies,
): AccessTokenVerifierPort & IdentityReadinessPort {
  const verifier = dependencies.createVerifier({
    algorithms: ['RS256'],
    audience: config.audience,
    issuer: config.issuer,
    jwksUri: config.jwksUri,
    requiredClaims: ['company_id'],
  })

  return {
    async checkReadiness() {
      const result = await verifier.probeJwks()
      return result.ready
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
