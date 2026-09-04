/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  createKeycloakAuthProvider,
  type KeycloakClient,
} from '../src/modules/identity/shared/KeycloakAuthProvider.provider'
import { readTrustedUrl } from '../src/modules/identity/shared/identityEnvironment.config'

const ACCESS_TOKEN = 'test-access-token'
const CALLBACK_URL = 'http://localhost/auth/callback'

/** Um JWT de mentira: só o corpo importa, e é dele que sai quem a sessão conhecia. */
function tokenFor(claims: Record<string, string>): string {
  return `x.${btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_')}.y`
}

function createClient(overrides: Partial<KeycloakClient> = {}): KeycloakClient {
  return {
    clearToken: mock(() => undefined),
    createLoginUrl: mock(() => Promise.resolve(CALLBACK_URL)),
    init: mock(() => Promise.resolve(true)),
    login: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    token: ACCESS_TOKEN,
    updateToken: mock(() => Promise.resolve(false)),
    ...overrides,
  }
}

describe('KeycloakAuthProvider', () => {
  test('initializes login-required with PKCE S256 and a fixed same-origin callback', async () => {
    const client = createClient()
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    await provider.initialize()

    expect(client.init).toHaveBeenCalledWith({
      checkLoginIframe: false,
      onLoad: 'login-required',
      pkceMethod: 'S256',
      redirectUri: 'http://localhost/auth/callback',
    })
  })

  test('refreshes before returning the in-memory access token', async () => {
    const client = createClient()
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    const token = await provider.getAccessToken()

    expect(token).toBe(ACCESS_TOKEN)
    expect(client.updateToken).toHaveBeenCalledWith(30)
    expect(client.clearToken).not.toHaveBeenCalled()
    expect(client.login).not.toHaveBeenCalled()
  })

  /**
   * Navegar para o login no meio de uma requisição aborta o `fetch` em voo e a tela volta sem
   * saber o que aconteceu com o comando. A sessão expirada é avisada; quem reautentica é o usuário.
   */
  test('clears the in-memory session and reports expiry without navigating away', async () => {
    const client = createClient({
      updateToken: mock(() => Promise.reject(new Error('remote refresh detail'))),
    })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)
    const notified = mock(() => undefined)
    provider.onSessionExpired(notified)

    const error = await provider.getAccessToken().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('IDENTITY_SESSION_EXPIRED')
    expect(client.clearToken).toHaveBeenCalledTimes(1)
    expect(client.login).not.toHaveBeenCalled()
    expect(notified).toHaveBeenCalledTimes(1)
  })

  test('reports expiry when the refresh succeeds but leaves no token', async () => {
    const client: KeycloakClient = {
      clearToken: mock(() => undefined),
      createLoginUrl: mock(() => Promise.resolve(CALLBACK_URL)),
      init: mock(() => Promise.resolve(true)),
      login: mock(() => Promise.resolve()),
      logout: mock(() => Promise.resolve()),
      updateToken: mock(() => Promise.resolve(false)),
    }
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    const error = await provider.getAccessToken().catch((caught: unknown) => caught)

    expect((error as Error).message).toBe('IDENTITY_SESSION_EXPIRED')
    expect(client.login).not.toHaveBeenCalled()
  })

  test('stops notifying an unsubscribed session listener', async () => {
    const client = createClient({
      updateToken: mock(() => Promise.reject(new Error('remote refresh detail'))),
    })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)
    const notified = mock(() => undefined)
    const unsubscribe = provider.onSessionExpired(notified)

    unsubscribe()
    await provider.getAccessToken().catch(() => undefined)

    expect(notified).not.toHaveBeenCalled()
  })

  /**
   * ⚠️ Achado em staging: a sessão que expira reiniciava **sem** `loginHint`, e o Keycloak caía na
   * tela genérica dele — "Usuário" e "Senha" juntos —, que não é a tela por onde a pessoa entrou.
   * Quem já esteve autenticado tem o `preferred_username` no token expirado; perguntá-lo de novo é
   * jogar fora o que a sessão sabe, e trocar a tela do produto pela de fábrica no meio do uso.
   */
  test('restarts authentication carrying who the expired session already knew', async () => {
    const client = createClient({ token: tokenFor({ preferred_username: 'anderson.filho' }) })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    await provider.restartAuthentication()

    expect(client.login).toHaveBeenCalledWith({
      loginHint: 'anderson.filho',
      redirectUri: 'http://localhost/auth/callback',
    })
  })

  /** Sem token legível não há quem sugerir — e sugerir vazio pediria a tela genérica de propósito. */
  test('restarts without a hint when the token says nothing', async () => {
    // `exactOptionalPropertyTypes`: ausência de token é a chave faltando, não a chave com `undefined`.
    const client: KeycloakClient = {
      clearToken: mock(() => undefined),
      createLoginUrl: mock(() => Promise.resolve(CALLBACK_URL)),
      init: mock(() => Promise.resolve(true)),
      login: mock(() => Promise.resolve()),
      logout: mock(() => Promise.resolve()),
      updateToken: mock(() => Promise.resolve(false)),
    }
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    await provider.restartAuthentication()

    expect(client.login).toHaveBeenCalledWith({
      redirectUri: 'http://localhost/auth/callback',
    })
  })

  test('fails closed when initialization does not authenticate the user', async () => {
    const client = createClient({ init: mock(() => Promise.resolve(false)) })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    const error = await provider.initialize().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('IDENTITY_REFRESH_FAILED')
    expect(client.clearToken).toHaveBeenCalledTimes(1)
    expect(client.login).toHaveBeenCalledTimes(1)
  })

  // Descartar o token antes do logout apaga o `id_token_hint`, e sem ele o Keycloak devolve o
  // usuário com a sessão SSO viva — o clique desloga e a tela volta logada.
  test('keeps the token until the logout redirect, so the id_token_hint survives', async () => {
    const client = createClient()
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    await provider.logout()

    expect(client.clearToken).not.toHaveBeenCalled()
    expect(client.logout).toHaveBeenCalledWith({ redirectUri: 'http://localhost' })
  })
})

describe('identity environment', () => {
  test('accepts HTTPS and local HTTP without credentials or URL suffixes', () => {
    expect(readTrustedUrl('https://identity.example.com/base/', 'URL')).toBe(
      'https://identity.example.com/base',
    )
    expect(readTrustedUrl('http://localhost:58080/', 'URL')).toBe('http://localhost:58080')
  })

  test.each([
    'ftp://localhost/resource',
    'http://127.0.0.1:58080',
    'http://localhost:58080?realm=unsafe',
    'http://localhost:58080/#unsafe',
    'https://user:password@identity.example.com',
  ])('rejects an untrusted identity URL: %s', (url) => {
    expect(() => readTrustedUrl(url, 'URL')).toThrow('IDENTITY_CONFIGURATION_INVALID_URL')
  })
})
