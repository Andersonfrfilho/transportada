/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import { loadFutureModule } from './identity.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

type ClientModule = {
  readonly createPasswordResetClient: (input: {
    apiBaseUrl: string
    fetch: (request: Request) => Promise<Response>
  }) => {
    confirm: (input: { code: string; password: string }) => Promise<void>
    request: (input: { username: string }) => Promise<void>
  }
}

async function loadClient(
  fetch: (request: Request) => Promise<Response>,
): Promise<ReturnType<ClientModule['createPasswordResetClient']>> {
  const { createPasswordResetClient } = await loadFutureModule<ClientModule>(
    '../../src/modules/identity/shared/passwordResetClient.service',
  )
  return createPasswordResetClient({ apiBaseUrl: 'https://transportada.test', fetch })
}

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('password reset client contract', () => {
  test('asks for the code with the login alone and no credential', async () => {
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.url).toBe('https://transportada.test/password-resets')
      expect(request.method).toBe('POST')
      expect(request.headers.get('authorization')).toBeNull()
      expect(request.cache).toBe('no-store')
      expect(await request.json()).toEqual({ username: 'maria' })
      return new Response(null, { status: 204 })
    })
    const client = await loadClient(fetch)

    await client.request({ username: 'maria' })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('confirms with the code and the new password', async () => {
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.url).toBe('https://transportada.test/password-resets/confirm')
      expect(await request.json()).toEqual({ code: 'a1b2c3d4', password: 'senha-nova-123456' })
      return new Response(null, { status: 204 })
    })
    const client = await loadClient(fetch)

    await client.confirm({ code: 'a1b2c3d4', password: 'senha-nova-123456' })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  /**
   * O primeiro passo é silencioso por construção do lado da API: login inexistente e login válido
   * respondem igual. O cliente não pode reintroduzir a diferença tratando falha de forma visível —
   * pedir o código sempre avança para o passo do código.
   */
  test('never distinguishes an unknown login: the request step cannot fail loudly', async () => {
    const client = await loadClient(() => Promise.resolve(new Response(null, { status: 204 })))

    expect(await client.request({ username: 'ninguem' })).toBeUndefined()
  })

  test.each([
    ['a rejected code', new Response(null, { status: 400 })],
    ['a server error', new Response(null, { status: 500 })],
  ])('collapses %s into the same generic error on confirm', async (_name, response) => {
    const client = await loadClient(() => Promise.resolve(response.clone()))

    let caught: unknown
    try {
      await client.confirm({ code: 'errado', password: 'senha-nova-123456' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('PASSWORD_RESET_REJECTED')
  })
})

describe('password reset public route contract', () => {
  test('renders its page before Keycloak initializes, for its own path', async () => {
    const main = await readModule('src/main.tsx')
    const bootstrapFunction = main.slice(main.indexOf('async function bootstrapApplication'))
    const pathCheckIndex = bootstrapFunction.indexOf("'/recuperar-senha'")
    const keycloakInitIndex = bootstrapFunction.indexOf('await initializeKeycloakAuth()')

    expect(main).toContain('PasswordResetPage')
    expect(pathCheckIndex).toBeGreaterThan(-1)
    expect(pathCheckIndex).toBeLessThan(keycloakInitIndex)
  })
})

describe('password reset screen contract', () => {
  test('has no hardcoded visible text: everything comes from the locale', async () => {
    const page = await readModule('src/modules/identity/pages/PasswordReset.page.tsx')

    expect(page).toContain("useTranslation('identity')")
    expect(page).toContain('Skeleton')
  })

  test('names every key the two steps read', async () => {
    const locale = (await Bun.file(
      new URL('src/modules/identity/locales/identity.locale.json', APPLICATION_ROOT),
    ).json()) as Record<string, string>

    for (const key of [
      'resetTitle',
      'resetDescription',
      'resetUsername',
      'resetCode',
      'resetNewPassword',
      'resetRequestSubmit',
      'resetConfirmSubmit',
      'resetCodeSent',
      'resetRejected',
      'resetDone',
      'resetBackToLogin',
    ]) {
      expect(locale[key]).toBeString()
    }
  })
})
