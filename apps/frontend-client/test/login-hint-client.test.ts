/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { resolveLoginHint } from '../src/modules/shared/loginHintClient.service'

const API_ENV_KEYS = [
  'VITE_API_URL',
  'VITE_CLIENT_APP_URL',
  'VITE_KEYCLOAK_CLIENT_ID',
  'VITE_KEYCLOAK_REALM',
  'VITE_KEYCLOAK_URL',
] as const

type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function stubFetch(response: Response): void {
  const stub: FetchFunction = () => Promise.resolve(response)
  globalThis.fetch = mock(stub) as unknown as typeof fetch
}

describe('resolveLoginHint', () => {
  const previous: Record<(typeof API_ENV_KEYS)[number], string | undefined> = {
    VITE_API_URL: undefined,
    VITE_CLIENT_APP_URL: undefined,
    VITE_KEYCLOAK_CLIENT_ID: undefined,
    VITE_KEYCLOAK_REALM: undefined,
    VITE_KEYCLOAK_URL: undefined,
  }
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    for (const key of API_ENV_KEYS) previous[key] = process.env[key]
    process.env.VITE_API_URL = 'http://localhost:53001'
    process.env.VITE_CLIENT_APP_URL = 'http://localhost:53100'
    process.env.VITE_KEYCLOAK_CLIENT_ID = 'transportada-client'
    process.env.VITE_KEYCLOAK_REALM = 'transportada'
    process.env.VITE_KEYCLOAK_URL = 'http://localhost:58080'
  })

  afterEach(() => {
    for (const key of API_ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    globalThis.fetch = originalFetch
  })

  test('returns the resolved login hint on a valid response', async () => {
    stubFetch(new Response(JSON.stringify({ data: { loginHint: 'anderson.filho' } })))

    expect(await resolveLoginHint('anderson@example.com')).toBe('anderson.filho')
  })

  test('falls back to the typed value when the response is not ok', async () => {
    stubFetch(new Response(null, { status: 500 }))

    expect(await resolveLoginHint('anderson@example.com')).toBe('anderson@example.com')
  })

  test('falls back to the typed value when the payload has no login hint', async () => {
    stubFetch(new Response(JSON.stringify({ data: {} })))

    expect(await resolveLoginHint('anderson@example.com')).toBe('anderson@example.com')
  })
})
