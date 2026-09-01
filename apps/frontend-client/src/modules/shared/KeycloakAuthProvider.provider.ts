/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ **Cópia por valor** do provedor do painel. As duas apps não importam código uma da outra, e a
 * autenticação é a parte em que isso mais dói de duplicar — mas é também a parte em que compartilhar
 * um bundle anularia a separação da ADR-0050 §1. O desvio deliberado: aqui **não existe o atalho de
 * autenticação usado nos testes de fumaça do painel**. Um bypass de autenticação num app servido a
 * usuário externo é exatamente o tipo de código que ninguém quer descobrir ligado em produção — e o
 * contrato de segurança desta app falha se ele reaparecer, por nome.
 */
import Keycloak from 'keycloak-js'

import { getClientEnvironment } from './environment.config'

const TOKEN_MINIMUM_VALIDITY_SECONDS = 30
const AUTHENTICATION_CALLBACK_PATH = '/auth/callback'
const POST_AUTHENTICATION_PATH_WINDOW_NAME_PREFIX = 'transportada-client:return-to:'

export type IdentityProfile = {
  readonly displayName: string
  readonly initials: string
  readonly pictureUrl: string | undefined
  readonly subtitle: string | undefined
}

export const IDENTITY_SESSION_EXPIRED = 'IDENTITY_SESSION_EXPIRED'

export type KeycloakAuthProvider = {
  getAccessToken(): Promise<string>
  getProfile(): IdentityProfile
  initialize(): Promise<void>
  logout(): Promise<void>
  onSessionExpired(listener: () => void): () => void
  restartAuthentication(): Promise<void>
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

function getAuthenticationCallbackUrl(): string {
  return `${getClientEnvironment().appBaseUrl}${AUTHENTICATION_CALLBACK_PATH}`
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
  const sessionExpiryListeners = new Set<() => void>()

  /** Redirecionar aqui abortaria o `fetch` em voo — a tela decide quando reautenticar. */
  function expireSession(): never {
    keycloak.clearToken()
    for (const listener of sessionExpiryListeners) listener()
    throw new Error(IDENTITY_SESSION_EXPIRED)
  }

  return {
    async getAccessToken(): Promise<string> {
      try {
        await keycloak.updateToken(TOKEN_MINIMUM_VALIDITY_SECONDS)
      } catch {
        return expireSession()
      }

      if (keycloak.token === undefined) {
        return expireSession()
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
    /** O token vive até o redirect: sem ele não há `id_token_hint` e a sessão SSO sobrevive. */
    async logout(): Promise<void> {
      await keycloak.logout({ redirectUri: new URL(redirectUri).origin })
    },
    onSessionExpired(listener: () => void): () => void {
      sessionExpiryListeners.add(listener)
      return () => {
        sessionExpiryListeners.delete(listener)
      }
    },
    async restartAuthentication(): Promise<void> {
      persistPostAuthenticationPath()
      keycloak.clearToken()
      await keycloak.login({ redirectUri })
    },
  }
}

export function getKeycloakAuthProvider(): KeycloakAuthProvider {
  if (authProvider === undefined) {
    const environment = getClientEnvironment()
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
