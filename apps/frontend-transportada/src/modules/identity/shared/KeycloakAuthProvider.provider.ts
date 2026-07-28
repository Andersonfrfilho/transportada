/* Copyright (c) 2026 Ada Technology. MIT License. */
import Keycloak from 'keycloak-js'

import { getIdentityEnvironment } from './identityEnvironment.config'
import { isSmokeAuthBypassEnabled } from './smokeAuthBypass.service'

const TOKEN_MINIMUM_VALIDITY_SECONDS = 30
const AUTHENTICATION_CALLBACK_PATH = '/auth/callback'
const POST_AUTHENTICATION_PATH_WINDOW_NAME_PREFIX = 'transportada:return-to:'

export type IdentityProfile = {
  readonly displayName: string
  readonly initials: string
  readonly pictureUrl: string | undefined
  readonly subtitle: string | undefined
}

export type KeycloakAuthProvider = {
  getAccessToken(): Promise<string>
  getProfile(): IdentityProfile
  initialize(): Promise<void>
  logout(): Promise<void>
}

const FALLBACK_PROFILE: IdentityProfile = {
  displayName: 'Usuário',
  initials: 'U',
  pictureUrl: undefined,
  subtitle: undefined,
}

function readClaimString(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function deriveInitials(displayName: string): string {
  const parts = displayName.split(/\s+/).filter((part) => part.length > 0)
  const first = parts[0]?.charAt(0) ?? 'U'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

function decodeTokenClaims(token: string | undefined): Record<string, unknown> {
  const payload = token?.split('.')[1]
  if (payload === undefined) {
    return {}
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const parsed: unknown = JSON.parse(atob(normalized))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function deriveIdentityProfile(claims: Record<string, unknown>): IdentityProfile {
  const email = readClaimString(claims, 'email')
  const preferredUsername = readClaimString(claims, 'preferred_username')
  const displayName =
    readClaimString(claims, 'name') ?? preferredUsername ?? email ?? FALLBACK_PROFILE.displayName
  const subtitle = email !== undefined && email !== displayName ? email : preferredUsername

  return {
    displayName,
    initials: deriveInitials(displayName),
    pictureUrl: readClaimString(claims, 'picture'),
    subtitle: subtitle !== displayName ? subtitle : undefined,
  }
}

export type KeycloakClient = Pick<
  Keycloak,
  'clearToken' | 'init' | 'login' | 'logout' | 'token' | 'updateToken'
>

let authProvider: KeycloakAuthProvider | undefined

function createSmokeAuthProvider(): KeycloakAuthProvider {
  return {
    getAccessToken(): Promise<string> {
      return Promise.resolve('smoke-access-token')
    },
    getProfile(): IdentityProfile {
      return {
        displayName: 'Smoke User',
        initials: 'SU',
        pictureUrl: undefined,
        subtitle: undefined,
      }
    },
    initialize(): Promise<void> {
      return Promise.resolve()
    },
    logout(): Promise<void> {
      window.location.assign('/')
      return Promise.resolve()
    },
  }
}

function getAuthenticationCallbackUrl(): string {
  return `${getIdentityEnvironment().appBaseUrl}${AUTHENTICATION_CALLBACK_PATH}`
}

function getCurrentApplicationPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function canUseBrowserNavigation(): boolean {
  return typeof window !== 'undefined'
}

function readWindowName(): string {
  return typeof window.name === 'string' ? window.name : ''
}

function writeWindowName(value: string): void {
  window.name = value
}

function persistPostAuthenticationPath(): void {
  if (!canUseBrowserNavigation()) {
    return
  }

  if (window.location.pathname === AUTHENTICATION_CALLBACK_PATH) {
    return
  }

  writeWindowName(`${POST_AUTHENTICATION_PATH_WINDOW_NAME_PREFIX}${getCurrentApplicationPath()}`)
}

function resolvePostAuthenticationPath(): string {
  if (!canUseBrowserNavigation()) {
    return '/'
  }

  const persistedPath = readWindowName()
  if (!persistedPath.startsWith(POST_AUTHENTICATION_PATH_WINDOW_NAME_PREFIX)) {
    return '/'
  }

  writeWindowName('')
  return persistedPath.slice(POST_AUTHENTICATION_PATH_WINDOW_NAME_PREFIX.length)
}

function restoreApplicationPathAfterAuthentication(): void {
  if (!canUseBrowserNavigation()) {
    return
  }

  if (window.location.pathname !== AUTHENTICATION_CALLBACK_PATH) {
    return
  }

  window.history.replaceState(window.history.state, '', resolvePostAuthenticationPath())
}

async function restartAuthentication(
  keycloak: KeycloakClient,
  redirectUri: string,
): Promise<never> {
  persistPostAuthenticationPath()
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
    getProfile(): IdentityProfile {
      return deriveIdentityProfile(decodeTokenClaims(keycloak.token))
    },
    async initialize(): Promise<void> {
      persistPostAuthenticationPath()

      try {
        const isAuthenticated = await keycloak.init({
          checkLoginIframe: false,
          onLoad: 'login-required',
          pkceMethod: 'S256',
          redirectUri,
        })

        if (!isAuthenticated) {
          await restartAuthentication(keycloak, redirectUri)
        }

        restoreApplicationPathAfterAuthentication()
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('3rd party check iframe')) {
          await restartAuthentication(keycloak, redirectUri)
        }

        throw error
      }
    },
    async logout(): Promise<void> {
      keycloak.clearToken()
      await keycloak.logout({ redirectUri: new URL(redirectUri).origin })
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
