/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import { createLandingHttpFixture, landingRequest, LANDING_LOGO_PATH } from '../fixtures/landing-http.fixture'

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe(`GET ${LANDING_LOGO_PATH} HTTP contract`, () => {
  test('answers anonymously with the configured logo bytes and an ETag', async () => {
    const fixture = await createLandingHttpFixture()
    fixture.companyLogoRepository.stored = {
      byteSize: PNG_BYTES.byteLength,
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      sha256: createHash('sha256').update(PNG_BYTES).digest('hex'),
      updatedAt: new Date('2026-08-25T12:00:00.000Z'),
    }

    const response = await fixture.handle(
      landingRequest({ authenticated: false, method: 'GET', pathname: LANDING_LOGO_PATH }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('etag')).toBe(`"${fixture.companyLogoRepository.stored.sha256}"`)
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES)
  })

  test('answers 404 when no logo is configured — not an error, the client falls back', async () => {
    const fixture = await createLandingHttpFixture()

    const response = await fixture.handle(
      landingRequest({ authenticated: false, method: 'GET', pathname: LANDING_LOGO_PATH }),
    )

    expect(response.status).toBe(404)
  })
})
