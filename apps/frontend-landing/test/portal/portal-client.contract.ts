/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createPortalClient, PortalRequestError } from '../../src/modules/portal/shared/portalClient.service.js'

const API_BASE_URL = 'http://localhost:1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })
}

const SESSION_BODY = {
  data: {
    accessToken: 'access-token-1',
    expiresInSeconds: 900,
    user: { email: 'candidato@example.com', id: 'user-1', isActive: true, name: 'Fulano de Tal' },
  },
}

describe('portal client', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // Bun test não roda num DOM — `sessionStorage` só existe quando o próprio serviço o cria
    // (jsdom, navegador); sem ele, a sessão nunca foi persistida e não há o que limpar.
    try {
      sessionStorage.clear()
    } catch {
      // ambiente sem sessionStorage — nada a fazer
    }
  })

  test('login sends credentials and stores the access token', async () => {
    let sentRequest: Request | undefined
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      sentRequest = new Request(input, init)
      return Promise.resolve(jsonResponse(SESSION_BODY))
    }) as unknown as typeof fetch

    const client = createPortalClient({ apiBaseUrl: API_BASE_URL })
    const session = await client.login({ email: 'candidato@example.com', password: 'senha1234' })

    expect(session.accessToken).toBe('access-token-1')
    expect(sentRequest?.url).toBe(`${API_BASE_URL}/user/auth/login`)
    expect((sentRequest?.credentials as string)).toBe('include')
  })

  test('an error response surfaces the code and message from the envelope', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } }, 401),
      )) as unknown as typeof fetch

    const client = createPortalClient({ apiBaseUrl: API_BASE_URL })
    const error = await client.login({ email: 'a@example.com', password: 'wrong' }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(PortalRequestError)
    expect((error as PortalRequestError).code).toBe('INVALID_CREDENTIALS')
  })

  test('register posts to the public accounts route and stores the session', async () => {
    let sentRequest: Request | undefined
    let sentBody: unknown
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      sentRequest = new Request(input, init)
      sentBody = init?.body === undefined ? undefined : JSON.parse(init.body as string)
      return Promise.resolve(jsonResponse(SESSION_BODY, 201))
    }) as unknown as typeof fetch

    const client = createPortalClient({ apiBaseUrl: API_BASE_URL })
    const session = await client.register({
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      password: 'senha1234',
      taxId: '12345678901',
    })

    expect(session.accessToken).toBe('access-token-1')
    expect(sentRequest?.url).toBe(`${API_BASE_URL}/public/aggregate-accounts`)
    expect(sentBody).toEqual({
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      password: 'senha1234',
      taxId: '12345678901',
    })
  })

  test('a 401 on an authenticated call refreshes the session once and retries', async () => {
    let profileCallCount = 0
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = new Request(input).url
      if (url.endsWith('/aggregate-portal/me')) {
        profileCallCount += 1
        if (profileCallCount === 1) return Promise.resolve(new Response(null, { status: 401 }))
        return Promise.resolve(jsonResponse({ data: { driver: null, rejectionReason: '', status: 'pending' } }))
      }
      if (url.endsWith('/user/auth/refresh')) {
        return Promise.resolve(jsonResponse({ data: { ...SESSION_BODY.data, accessToken: 'access-token-2' } }))
      }
      return Promise.reject(new Error(`unexpected request: ${url}`))
    }) as unknown as typeof fetch

    const client = createPortalClient({ apiBaseUrl: API_BASE_URL })
    const profile = await client.getProfile()

    expect(profile.status).toBe('pending')
    expect(profileCallCount).toBe(2)
  })

  test('a 401 that survives refresh is returned as-is, without looping', async () => {
    let profileCallCount = 0
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = new Request(input).url
      if (url.endsWith('/aggregate-portal/me')) {
        profileCallCount += 1
        return Promise.resolve(new Response(null, { status: 401 }))
      }
      if (url.endsWith('/user/auth/refresh')) {
        return Promise.resolve(new Response(null, { status: 401 }))
      }
      return Promise.reject(new Error(`unexpected request: ${url}`))
    }) as unknown as typeof fetch

    const client = createPortalClient({ apiBaseUrl: API_BASE_URL })
    const error = await client.getProfile().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(PortalRequestError)
    expect(profileCallCount).toBe(1)
  })
})
