/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  createKeycloakAuthProvider,
  type KeycloakClient,
} from '../src/modules/identity/shared/KeycloakAuthProvider.provider'
import { readTrustedUrl } from '../src/modules/identity/shared/identityEnvironment.config'

const ACCESS_TOKEN = 'test-access-token'
const CALLBACK_URL = 'http://localhost/auth/callback'

function createClient(overrides: Partial<KeycloakClient> = {}): KeycloakClient {
  return {
    clearToken: mock(() => undefined),
    init: mock(() => Promise.resolve(true)),
    login: mock(() => Promise.resolve()),
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

  test('clears the in-memory session and restarts login when refresh fails', async () => {
    const client = createClient({
      updateToken: mock(() => Promise.reject(new Error('remote refresh detail'))),
    })
    const provider = createKeycloakAuthProvider(client, CALLBACK_URL)

    const error = await provider.getAccessToken().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('IDENTITY_REFRESH_FAILED')
    expect(client.clearToken).toHaveBeenCalledTimes(1)
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
