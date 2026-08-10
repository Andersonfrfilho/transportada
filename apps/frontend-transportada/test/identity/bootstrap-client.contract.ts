/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  BOOTSTRAP_ADMINISTRATOR_INPUT,
  BOOTSTRAP_FIRST_ADMIN_RESPONSE,
  SYNTHETIC_BOOTSTRAP_TOKEN,
  loadFutureModule,
} from './identity.fixture'

type ValidationModule = {
  readonly isBootstrapFirstAdminResponse: (value: unknown) => boolean
}

type ClientModule = {
  readonly createBootstrapClient: (input: {
    apiBaseUrl: string
    fetch: (request: Request) => Promise<Response>
  }) => {
    checkAvailability: () => Promise<boolean>
    createFirstAdmin: (input: {
      administrator: typeof BOOTSTRAP_ADMINISTRATOR_INPUT
      token: string
    }) => Promise<unknown>
  }
}

async function loadClient(
  fetch: (request: Request) => Promise<Response>,
): Promise<ReturnType<ClientModule['createBootstrapClient']>> {
  const { createBootstrapClient } = await loadFutureModule<ClientModule>(
    '../../src/modules/identity/shared/bootstrapClient.service',
  )
  return createBootstrapClient({ apiBaseUrl: 'https://transportada.test', fetch })
}

describe('identity bootstrap client contract', () => {
  test('accepts the first-admin response and rejects malformed shapes', async () => {
    const { isBootstrapFirstAdminResponse } = await loadFutureModule<ValidationModule>(
      '../../src/modules/identity/shared/bootstrap.validation',
    )

    expect(isBootstrapFirstAdminResponse(BOOTSTRAP_FIRST_ADMIN_RESPONSE)).toBeTrue()
    expect(isBootstrapFirstAdminResponse({ data: { companyId: 'x' } })).toBeFalse()
    expect(isBootstrapFirstAdminResponse(null)).toBeFalse()
  })

  test('posts the token as a bearer header and the administrator body as JSON', async () => {
    const { createBootstrapClient } = await loadFutureModule<ClientModule>(
      '../../src/modules/identity/shared/bootstrapClient.service',
    )
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.url).toBe('https://transportada.test/bootstrap/first-admin')
      expect(request.method).toBe('POST')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_BOOTSTRAP_TOKEN}`)
      expect(request.cache).toBe('no-store')
      expect(request.headers.get('content-type')).toBe('application/json')
      expect(await request.json()).toEqual(BOOTSTRAP_ADMINISTRATOR_INPUT)
      return Response.json(BOOTSTRAP_FIRST_ADMIN_RESPONSE, { status: 201 })
    })
    const client = createBootstrapClient({ apiBaseUrl: 'https://transportada.test', fetch })

    const result = await client.createFirstAdmin({
      administrator: BOOTSTRAP_ADMINISTRATOR_INPUT,
      token: SYNTHETIC_BOOTSTRAP_TOKEN,
    })

    expect(result).toEqual(BOOTSTRAP_FIRST_ADMIN_RESPONSE.data)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test.each([
    [
      'a 404 refusal',
      new Response(JSON.stringify({ error: { code: 'ALREADY_PROVISIONED' } }), { status: 404 }),
    ],
    [
      'a 404 refusal for a different reason',
      new Response(JSON.stringify({ error: { code: 'TOKEN_MISMATCH' } }), { status: 404 }),
    ],
    [
      'a 400 invalid body',
      new Response(JSON.stringify({ error: { code: 'INVALID_REQUEST' } }), { status: 400 }),
    ],
  ])('collapses %s into the same generic unavailable error', async (_name, response) => {
    const { createBootstrapClient } = await loadFutureModule<ClientModule>(
      '../../src/modules/identity/shared/bootstrapClient.service',
    )
    const client = createBootstrapClient({
      apiBaseUrl: 'https://transportada.test',
      fetch: () => Promise.resolve(response.clone()),
    })

    let caught: unknown
    try {
      await client.createFirstAdmin({
        administrator: BOOTSTRAP_ADMINISTRATOR_INPUT,
        token: 'wrong',
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('BOOTSTRAP_UNAVAILABLE')
  })
})

/**
 * A sondagem existe para a tela de primeiro acesso sumir depois do arranque. Ela não é a proteção —
 * quem impede a criação de um segundo administrador é o POST, com token e trava no banco. Por isso
 * ela não manda token nenhum: o que ela pergunta é sobre o ambiente, não sobre quem pergunta.
 */
describe('identity bootstrap availability probe contract', () => {
  test('asks with a plain GET that carries no credential at all', async () => {
    const fetch = mock((request: Request): Promise<Response> => {
      expect(request.url).toBe('https://transportada.test/bootstrap/first-admin')
      expect(request.method).toBe('GET')
      expect(request.headers.get('authorization')).toBeNull()
      expect(request.cache).toBe('no-store')
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    const client = await loadClient(fetch)

    expect(await client.checkAvailability()).toBeTrue()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('reads the uniform 404 as a door already closed', async () => {
    const client = await loadClient(() =>
      Promise.resolve(Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })),
    )

    expect(await client.checkAvailability()).toBeFalse()
  })

  /**
   * Falha aberta de propósito: a sondagem é conforto de tela, e API fora do ar não pode deixar uma
   * instalação nova sem como fazer o primeiro acesso. Errar para o lado do formulário é reversível;
   * errar para o lado do redirecionamento tranca quem ainda precisa arrancar.
   */
  test.each([
    ['the API is unreachable', () => Promise.reject(new Error('connection refused'))],
    ['the API answers a server error', () => Promise.resolve(new Response(null, { status: 500 }))],
  ])('keeps the form reachable when %s', async (_name, respond) => {
    const client = await loadClient(respond)

    expect(await client.checkAvailability()).toBeTrue()
  })
})
