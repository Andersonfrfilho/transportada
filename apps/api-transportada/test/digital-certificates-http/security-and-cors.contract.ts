/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  certificateGetRequest,
  certificatePostRequest,
  createDigitalCertificatesHttpFixture,
  DIGITAL_CERTIFICATES_PATH,
  FRONTEND_ORIGIN,
  responseApiError,
  unauthenticatedError,
} from '../fixtures/digital-certificates-http.fixture'

describe('/digital-certificates security and CORS contract', () => {
  test('requires authentication before reading multipart', async () => {
    const fixture = await createDigitalCertificatesHttpFixture({
      authenticationError: unauthenticatedError(),
    })
    const request = certificatePostRequest({ events: fixture.events })

    const response = await fixture.handle(request)

    expect(response.status).toBe(401)
    expect((await responseApiError(response)).error.code).toBe('UNAUTHENTICATED')
    expect(fixture.events).toEqual(['authenticate'])
    expect(fixture.replaceCalls).toHaveLength(0)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('requires settings.manage for GET and POST before protected work', async () => {
    for (const method of ['GET', 'POST']) {
      const fixture = await createDigitalCertificatesHttpFixture({
        permissions: new Set(['invoices.read']),
      })
      const request =
        method === 'GET'
          ? certificateGetRequest()
          : certificatePostRequest({ events: fixture.events })

      const response = await fixture.handle(request)

      expect(response.status).toBe(403)
      expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
      expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
      expect(fixture.listCalls).toHaveLength(0)
      expect(fixture.replaceCalls).toHaveLength(0)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  test('allows only the exact GET and POST preflights without authentication', async () => {
    for (const [method, headers] of [
      ['GET', 'Authorization'],
      ['POST', 'Authorization, Content-Type, Idempotency-Key'],
    ] as const) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(preflightRequest({ headers, method }))

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, DELETE')
      expect(response.headers.get('access-control-allow-headers')).toBe(
        'Authorization, Content-Type, Idempotency-Key',
      )
      expect(response.headers.has('access-control-allow-credentials')).toBe(false)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(fixture.events).toEqual([])
    }
  })

  test('rejects unsafe preflights without protected work', async () => {
    for (const [origin, method, headers] of unsafePreflights()) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(preflightRequest({ headers, method, origin }))

      expect(response.status).toBe(403)
      expect(response.headers.has('access-control-allow-origin')).toBe(false)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(fixture.events).toEqual([])
    }
  })

  test('adds only the exact allowed origin to actual GET and POST responses', async () => {
    const fixture = await createDigitalCertificatesHttpFixture()
    const responses = await Promise.all([
      fixture.handle(certificateGetRequest({ origin: FRONTEND_ORIGIN })),
      fixture.handle(certificatePostRequest({ origin: FRONTEND_ORIGIN })),
    ])

    for (const response of responses) {
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
      expect(response.headers.has('access-control-allow-credentials')).toBe(false)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  test('does not reflect an attacker origin or duplicate CORS response headers', async () => {
    const fixture = await createDigitalCertificatesHttpFixture()
    const response = await fixture.handle(
      certificateGetRequest({ origin: 'https://attacker.example' }),
    )

    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(response.headers.get('vary')).toBe('Origin')
    expect(response.headers.get('vary')?.split(',')).toHaveLength(1)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

type PreflightRequestParams = {
  readonly headers: string
  readonly method: string
  readonly origin?: string
}

function preflightRequest({
  headers,
  method,
  origin = FRONTEND_ORIGIN,
}: PreflightRequestParams): Request {
  return new Request(`http://localhost${DIGITAL_CERTIFICATES_PATH}`, {
    headers: {
      origin,
      'access-control-request-headers': headers,
      'access-control-request-method': method,
    },
    method: 'OPTIONS',
  })
}

function unsafePreflights(): readonly (readonly [string, string, string])[] {
  return [
    ['https://attacker.example', 'POST', 'Authorization, Content-Type, Idempotency-Key'],
    [FRONTEND_ORIGIN, 'PATCH', 'Authorization'],
    [FRONTEND_ORIGIN, 'GET', 'Content-Type'],
    [FRONTEND_ORIGIN, 'POST', 'Authorization, Content-Type'],
    [FRONTEND_ORIGIN, 'POST', 'Authorization, Content-Type, X-Company-Id'],
    [FRONTEND_ORIGIN, 'POST', 'Authorization, Authorization, Content-Type, Idempotency-Key'],
  ]
}
