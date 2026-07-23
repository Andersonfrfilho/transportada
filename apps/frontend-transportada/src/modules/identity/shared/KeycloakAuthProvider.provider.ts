/* Copyright (c) 2026 Ada Technology. MIT License. */
import Keycloak from 'keycloak-js'

import { getIdentityEnvironment } from './identityEnvironment.config'
import { isSmokeAuthBypassEnabled } from './smokeAuthBypass.service'

const TOKEN_MINIMUM_VALIDITY_SECONDS = 30

export type KeycloakAuthProvider = {
  getAccessToken(): Promise<string>
  initialize(): Promise<void>
}

export type KeycloakClient = Pick<
  Keycloak,
  'clearToken' | 'init' | 'login' | 'token' | 'updateToken'
>

let authProvider: KeycloakAuthProvider | undefined

function createSmokeAuthProvider(): KeycloakAuthProvider {
  return {
    getAccessToken(): Promise<string> {
      return Promise.resolve('smoke-access-token')
    },
    initialize(): Promise<void> {
      return Promise.resolve()
    },
  }
}

function getAuthenticationCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`
}

async function restartAuthentication(
  keycloak: KeycloakClient,
  redirectUri: string,
): Promise<never> {
  keycloak.clearToken()
  await keycloak.login({ redirectUri })
  throw new Error('IDENTITY_REFRESH_FAILED')
}

export function createKeycloakAuthProvider(
  keycloak: KeycloakClient,
  redirectUri: string,
): KeycloakAuthProvider {
  return {
    async getAccessToken(): Promise<string> {
      try {
        await keycloak.updateToken(TOKEN_MINIMUM_VALIDITY_SECONDS)
      } catch {
        return restartAuthentication(keycloak, redirectUri)
      }

      if (keycloak.token === undefined) {
        return restartAuthentication(keycloak, redirectUri)
      }

      return keycloak.token
    },
    async initialize(): Promise<void> {
      const isAuthenticated = await keycloak.init({
        checkLoginIframe: false,
        onLoad: 'login-required',
        pkceMethod: 'S256',
        redirectUri,
      })

      if (!isAuthenticated) {
        await restartAuthentication(keycloak, redirectUri)
      }
    },
  }
}

export function getKeycloakAuthProvider(): KeycloakAuthProvider {
  if (authProvider === undefined) {
    if (isSmokeAuthBypassEnabled()) {
      authProvider = createSmokeAuthProvider()
      return authProvider
    }
    const environment = getIdentityEnvironment()
    authProvider = createKeycloakAuthProvider(
      new Keycloak(environment.keycloak),
      getAuthenticationCallbackUrl(),
    )
  }

  return authProvider
}

export async function initializeKeycloakAuth(): Promise<void> {
  await getKeycloakAuthProvider().initialize()
}
