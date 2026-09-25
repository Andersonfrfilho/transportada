/* Cópia por valor de apps/frontend-client/test/keycloak-auth-provider.test.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import {
  createKeycloakAuthProvider,
  IDENTITY_SESSION_EXPIRED,
  IDENTITY_UNREACHABLE,
  IdentityUnreachableError,
  sanitizePostAuthenticationPath,
  type KeycloakClient,
} from '../../src/modules/shared/KeycloakAuthProvider.provider'
import { readTrustedUrl } from '../../src/modules/shared/environment.config'

const ACCESS_TOKEN = 'test-access-token'
const CALLBACK_URL = 'http://localhost/auth/callback'

function createClient(overrides: Partial<KeycloakClient> = {}): KeycloakClient {
  return {
    clearToken: mock(() => undefined),
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
  test('an expired refresh clears the token and notifies listeners before throwing', async () => {
    const client = createClient({
      updateToken: mock(() => Promise.reject(new Error('remote refresh detail'))),
    })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)
    const listener = mock(() => undefined)
    provider.onSessionExpired(listener)

    const error = await provider.getAccessToken().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('IDENTITY_SESSION_EXPIRED')
    expect(client.clearToken).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  /**
   * Spec 189 T9.2 (A1): o keycloak-js 26.2.4 só limpa o token quando o refresh volta `400`. Falha de
   * transporte (subsolo, sinal fraco) não é sessão vencida: expirar aqui mandava o motorista entrar
   * de novo sem rede, e a fila marcava o toque como recusado.
   */
  test('a transport failure on refresh keeps the session and throws a typed network error', async () => {
    const client = createClient({
      updateToken: mock(() => Promise.reject(new TypeError('Failed to fetch'))),
    })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)
    const listener = mock(() => undefined)
    provider.onSessionExpired(listener)

    const error = await provider.getAccessToken().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(IdentityUnreachableError)
    expect((error as Error).message).toBe(IDENTITY_UNREACHABLE)
    expect(client.clearToken).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
  })

  test('a 5xx from the token endpoint is transport too, not an expired session', async () => {
    const client = createClient({
      updateToken: mock(() =>
        Promise.reject(Object.assign(new Error('bad status'), { response: { status: 503 } })),
      ),
    })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)
    const listener = mock(() => undefined)
    provider.onSessionExpired(listener)

    const error = await provider.getAccessToken().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(IdentityUnreachableError)
    expect(listener).not.toHaveBeenCalled()
  })

  test('only a 400 from the token endpoint expires the session', async () => {
    const client = createClient({
      updateToken: mock(() =>
        Promise.reject(Object.assign(new Error('bad status'), { response: { status: 400 } })),
      ),
    })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)
    const listener = mock(() => undefined)
    provider.onSessionExpired(listener)

    const error = await provider.getAccessToken().catch((caught: unknown) => caught)

    expect((error as Error).message).toBe(IDENTITY_SESSION_EXPIRED)
    expect(client.clearToken).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('a failed sign-on restarts authentication and clears the token', async () => {
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

/**
 * ⚠️ **A verificação do app vem sempre antes do Keycloak.** A pessoa entra por qualquer contato
 * cadastrado — e-mail, CPF, CNPJ, telefone —, e quem traduz isso em login é a nossa tela; o
 * Keycloak sozinho só entende o username. Reautenticar direto nele pula essa porta.
 */
describe('KeycloakAuthProvider with the identifier step on', () => {
  const IDENTIFIER_FLAG = 'VITE_IDENTIFIER_FIRST_LOGIN'
  let previousFlag: string | undefined

  beforeEach(() => {
    previousFlag = process.env[IDENTIFIER_FLAG]
    process.env[IDENTIFIER_FLAG] = 'true'
  })

  afterEach(() => {
    if (previousFlag === undefined) delete process.env[IDENTIFIER_FLAG]
    else process.env[IDENTIFIER_FLAG] = previousFlag
  })

  test('restarting authentication reloads the page instead of going straight to the provider', async () => {
    const client = createClient({
      updateToken: mock(() => Promise.reject(new Error('remote refresh detail'))),
    })
    const reloadApplication = mock(() => undefined)
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL, { reloadApplication })

    await provider.getAccessToken().catch(() => undefined)
    await provider.restartAuthentication()

    expect(client.login).not.toHaveBeenCalled()
    expect(reloadApplication).toHaveBeenCalledTimes(1)
  })

  test('initialization without a session hands over to the identifier screen', async () => {
    const client = createClient({ init: mock(() => Promise.resolve(false)) })
    const reloadApplication = mock(() => undefined)
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL, { reloadApplication })

    expect(await provider.initialize()).toBe(false)
    expect(client.login).not.toHaveBeenCalled()
    expect(reloadApplication).not.toHaveBeenCalled()
  })

  /** Recarregar aqui repetiria o mesmo erro para sempre: a tela de identificação é o destino. */
  test('the third party iframe failure hands over to the identifier screen', async () => {
    const client = createClient({
      init: mock(() =>
        Promise.reject(new Error('Timeout when waiting for 3rd party check iframe message.')),
      ),
    })
    const reloadApplication = mock(() => undefined)
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL, { reloadApplication })

    expect(await provider.initialize()).toBe(false)
    expect(client.login).not.toHaveBeenCalled()
    expect(reloadApplication).not.toHaveBeenCalled()
  })

  test('the identifier screen still reaches the provider with the resolved login', async () => {
    const client = createClient()
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    await provider.loginWith('anderson.filho')

    expect(client.login).toHaveBeenCalledWith({
      loginHint: 'anderson.filho',
      redirectUri: 'http://localhost/auth/callback',
    })
  })
})

describe('KeycloakAuthProvider with the identifier step off', () => {
  test('the third party iframe failure restarts at the provider, as before', async () => {
    const client = createClient({
      init: mock(() =>
        Promise.reject(new Error('Timeout when waiting for 3rd party check iframe message.')),
      ),
    })
    const reloadApplication = mock(() => undefined)
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL, { reloadApplication })

    await provider.initialize().catch(() => undefined)

    expect(client.login).toHaveBeenCalledWith({ redirectUri: 'http://localhost/auth/callback' })
    expect(reloadApplication).not.toHaveBeenCalled()
  })
})

describe('driver environment', () => {
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
    expect(() => readTrustedUrl(url, 'URL')).toThrow('DRIVER_CONFIGURATION_INVALID_URL')
  })
})

/**
 * Spec 189 T9.2 (L8): o caminho de volta mora em `window.name`, que outra página da mesma aba pode
 * escrever. Só caminho da própria app — começa com `/` e não é `//` nem `/\\` (protocolo relativo).
 */
describe('sanitizePostAuthenticationPath (L8)', () => {
  test.each(['/', '/perfil', '/notificacoes?aba=1#topo'])('aceita %s', (path) => {
    expect(sanitizePostAuthenticationPath(path)).toBe(path)
  })

  test.each([
    '//evil.example',
    '/\\evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    '',
  ])('troca %s pela raiz', (path) => {
    expect(sanitizePostAuthenticationPath(path)).toBe('/')
  })
})
