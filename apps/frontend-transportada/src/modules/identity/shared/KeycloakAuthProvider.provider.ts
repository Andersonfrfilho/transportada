/* Copyright (c) 2026 Ada Technology. MIT License. */
import Keycloak from 'keycloak-js'

import { readBrowserColorTheme } from '@/modules/shared/browserColorTheme.service'
import type { ColorTheme } from '@/modules/shared/colorTheme.constant'
import { appendColorThemeToLoginUrl } from '@/modules/shared/colorTheme.service'
import { toDisplayPersonName } from '@/modules/shared/personName.service'

import { getIdentityEnvironment, isIdentifierFirstLoginEnabled } from './identityEnvironment.config'
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

export const IDENTITY_SESSION_EXPIRED = 'IDENTITY_SESSION_EXPIRED'

export type KeycloakAuthProvider = {
  getAccessToken(): Promise<string>
  getProfile(): IdentityProfile
  /** `false` quando a etapa de identificação está ligada e ninguém entrou ainda. */
  initialize(): Promise<boolean>
  /** Só com a etapa ligada: leva ao provedor já com o login resolvido. */
  loginWith(loginHint: string): Promise<void>
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
  const claimedName = readClaimString(claims, 'name')
  /**
   * Só o nome ganha a grafia de tela: o que sobra sem ele é login ou e-mail, e recapitalizar
   * `anderson.filho@…` daria um endereço que não existe estampado no cabeçalho.
   */
  const displayName =
    claimedName !== undefined
      ? toDisplayPersonName(claimedName)
      : (preferredUsername ?? email ?? FALLBACK_PROFILE.displayName)
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
  'clearToken' | 'createLoginUrl' | 'init' | 'login' | 'logout' | 'token' | 'updateToken'
>

/**
 * A tela de login é do Keycloak, e o Keycloak é **outra origem**: ele não alcança o armazenamento do
 * navegador onde a escolha do sol/lua mora. Sem isto o painel abre claro e o login continua escuro, porque lá o
 * único sinal disponível é o `prefers-color-scheme` do sistema.
 *
 * A costura é o `createLoginUrl` porque **todo** caminho de entrada passa por ele — inclusive o
 * `init({onLoad: 'login-required'})`, que redireciona por dentro do keycloak-js e não alcançaria um
 * decorador em volta do `login()`. No keycloak-js ele é campo de instância, e as chamadas internas
 * são `this.createLoginUrl(...)`: sobrescrever na instância cobre init, reautenticação e a etapa de
 * identificação de uma vez.
 *
 * ⚠️ Isto **não** é a segunda preferência que a decisão anterior recusou (ADR-0060): ninguém escolhe nada na tela de
 * login. O que viaja é cópia da escolha do painel, reescrita a cada entrada.
 */
export function shareColorThemeWithLoginScreen(input: {
  readonly keycloak: Pick<KeycloakClient, 'createLoginUrl'>
  readonly readTheme: () => ColorTheme
}): void {
  const createLoginUrl = input.keycloak.createLoginUrl.bind(input.keycloak)

  input.keycloak.createLoginUrl = async (options) =>
    appendColorThemeToLoginUrl({
      url: await createLoginUrl(options),
      theme: input.readTheme(),
    })
}

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
    /** O smoke entra sempre: o bypass existe justamente para não depender do provedor. */
    initialize(): Promise<boolean> {
      return Promise.resolve(true)
    },
    loginWith(): Promise<void> {
      return Promise.resolve()
    },
    logout(): Promise<void> {
      window.location.assign('/')
      return Promise.resolve()
    },
    onSessionExpired(): () => void {
      return () => undefined
    },
    restartAuthentication(): Promise<void> {
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
  await loginAgain(keycloak, redirectUri)
  throw new Error('IDENTITY_REFRESH_FAILED')
}

/**
 * ⚠️ **A sessão que expira já sabe quem era.** Reiniciar sem `loginHint` faz o Keycloak servir a
 * tela de fábrica dele — "Usuário" e "Senha" juntos —, que não é a tela por onde a pessoa entrou:
 * o produto pergunta e-mail, CPF, CNPJ ou telefone, e a senha só na tela seguinte. Trocar de tela
 * no meio do uso é a mesma instalação pedindo a mesma coisa de dois jeitos.
 *
 * O `preferred_username` sai do token **expirado**, que continua legível — é o mesmo valor que
 * `/login-hints` devolve na entrada normal, então nada de novo aparece na URL. Sem token legível
 * não há o que sugerir, e aí a tela genérica é o caminho certo.
 */
async function loginAgain(keycloak: KeycloakClient, redirectUri: string): Promise<void> {
  const loginHint = readClaimString(decodeTokenClaims(keycloak.token), 'preferred_username')
  keycloak.clearToken()
  await keycloak.login(loginHint === undefined ? { redirectUri } : { loginHint, redirectUri })
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
    async loginWith(loginHint: string): Promise<void> {
      persistPostAuthenticationPath()
      await keycloak.login({ loginHint, redirectUri })
    },
    async initialize(): Promise<boolean> {
      persistPostAuthenticationPath()
      const identifierFirst = isIdentifierFirstLoginEnabled()

      try {
        /**
         * `check-sso` só olha se já existe sessão e volta; `login-required` redireciona sozinho,
         * antes de a aplicação renderizar qualquer coisa. Com a etapa ligada é preciso voltar sem
         * sessão para a tela de identificação poder existir.
         */
        const isAuthenticated = await keycloak.init({
          checkLoginIframe: false,
          onLoad: identifierFirst ? 'check-sso' : 'login-required',
          pkceMethod: 'S256',
          redirectUri,
        })

        /** Sem sessão e com a etapa ligada: quem decide o próximo passo é a tela, não o provedor. */
        if (!isAuthenticated && identifierFirst) return false

        if (!isAuthenticated) {
          await restartAuthentication(keycloak, redirectUri)
        }

        restoreApplicationPathAfterAuthentication()
        return true
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
      await loginAgain(keycloak, redirectUri)
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
    const keycloak = new Keycloak(environment.keycloak)
    shareColorThemeWithLoginScreen({ keycloak, readTheme: readBrowserColorTheme })
    authProvider = createKeycloakAuthProvider(keycloak, getAuthenticationCallbackUrl())
  }

  return authProvider
}

export async function initializeKeycloakAuth(): Promise<boolean> {
  return getKeycloakAuthProvider().initialize()
}
