/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import { loadFutureModule } from './identity.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

type ClientModule = {
  readonly createUserActivationClient: (input: {
    apiBaseUrl: string
    fetch: (request: Request) => Promise<Response>
  }) => { activate: (input: { code: string; password: string }) => Promise<void> }
  readonly readActivationCodeFromHash: (hash: string) => string
}

function loadModule(): Promise<ClientModule> {
  return loadFutureModule<ClientModule>(
    '../../src/modules/identity/shared/userActivationClient.service',
  )
}

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * A API tinha `POST /user-activation` desde a spec 026, e nenhuma tela a chamava: quem recebia o
 * convite só tinha o código, e em 25/09/2026 ele foi digitado como senha no login.
 */
describe('user activation client contract', () => {
  test('sends the code and the new password with no credential', async () => {
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.url).toBe('https://transportada.test/user-activation')
      expect(request.method).toBe('POST')
      expect(request.headers.get('authorization')).toBeNull()
      expect(request.cache).toBe('no-store')
      expect(await request.json()).toEqual({ code: 'abc123', password: 'senha-forte-123' })
      return new Response(null, { status: 204 })
    })
    const { createUserActivationClient } = await loadModule()

    await createUserActivationClient({ apiBaseUrl: 'https://transportada.test', fetch }).activate({
      code: 'abc123',
      password: 'senha-forte-123',
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['a rejected code', () => Promise.resolve(new Response(null, { status: 400 }))],
    ['a network failure', () => Promise.reject(new TypeError('offline'))],
  ])('collapses %s into the same generic error', async (_name, fetch) => {
    const { createUserActivationClient } = await loadModule()
    const client = createUserActivationClient({ apiBaseUrl: 'https://transportada.test', fetch })

    let caught: unknown
    try {
      await client.activate({ code: 'x', password: 'senha-forte-123' })
    } catch (error) {
      caught = error
    }

    expect((caught as Error).message).toBe('USER_ACTIVATION_REJECTED')
  })
})

/** O link do e-mail traz o código no fragmento, que o navegador nunca envia a servidor nenhum. */
describe('activation code from the e-mail link', () => {
  test('reads the code from the fragment', async () => {
    const { readActivationCodeFromHash } = await loadModule()

    expect(readActivationCodeFromHash('#codigo=1e45fbd07992c00a')).toBe('1e45fbd07992c00a')
    expect(readActivationCodeFromHash('#codigo=%20abc%20')).toBe('abc')
  })

  test('reads nothing from an empty or foreign fragment', async () => {
    const { readActivationCodeFromHash } = await loadModule()

    expect(readActivationCodeFromHash('')).toBe('')
    expect(readActivationCodeFromHash('#outro=1')).toBe('')
  })
})

describe('activation public route contract', () => {
  test('renders the activation page before Keycloak initializes, for its own path', async () => {
    const main = await readSource('src/main.tsx')
    const bootstrap = main.slice(main.indexOf('async function bootstrapApplication'))
    const pathIndex = bootstrap.indexOf("'/ativar'")
    const keycloakIndex = bootstrap.indexOf('await initializeKeycloakAuth()')

    expect(pathIndex).toBeGreaterThan(-1)
    expect(pathIndex).toBeLessThan(keycloakIndex)
  })

  /** O código não fica na barra de endereço depois de lido: histórico e print não o levam adiante. */
  test('the page clears the fragment after reading the code', async () => {
    const hook = await readSource('src/modules/identity/hooks/useUserActivation.hook.ts')

    expect(hook).toContain('readActivationCodeFromHash')
    expect(hook).toContain('history.replaceState')
  })
})
