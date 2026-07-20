/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_CONTEXT, OTHER_COMPANY_ID } from '../fixtures/company-settings-application.fixture'
import {
  ACTIVE_CERTIFICATE,
  encodeCursor,
  expectedMetadata,
  NEXT_CURSOR,
  RETIRED_CERTIFICATE,
} from '../fixtures/digital-certificates-http-payload.fixture'
import {
  certificateGetRequest,
  createDigitalCertificatesHttpFixture,
  DIGITAL_CERTIFICATES_PATH,
  responseApiError,
} from '../fixtures/digital-certificates-http.fixture'

describe('GET /digital-certificates listing contract', () => {
  test('lists only authenticated tenant metadata with default pagination', async () => {
    const runtimeItem = {
      ...ACTIVE_CERTIFICATE,
      certificateBase64: 'must-not-leak',
      cnpj: '61156864000191',
      fingerprint: 'must-not-leak',
      keyId: 'must-not-leak',
      password: 'must-not-leak',
      secretEnvelope: { ciphertext: 'must-not-leak' },
    }
    const fixture = await createDigitalCertificatesHttpFixture({
      listResult: { items: [runtimeItem, RETIRED_CERTIFICATE], nextCursor: NEXT_CURSOR },
    })
    const request = certificateGetRequest()
    request.headers.set('x-company-id', OTHER_COMPANY_ID)

    const response = await fixture.handle(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      data: [expectedMetadata(ACTIVE_CERTIFICATE), expectedMetadata(RETIRED_CERTIFICATE)],
      page: { nextCursor: encodeCursor(NEXT_CURSOR) },
    })
    expect(fixture.listCalls).toEqual([{ context: COMPANY_CONTEXT, limit: 25 }])
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    assertMetadataOnly(JSON.stringify(body))
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({ pathname: DIGITAL_CERTIFICATES_PATH, status: 200 }),
    )
  })

  test('returns an explicit null cursor for the final page', async () => {
    const fixture = await createDigitalCertificatesHttpFixture({
      listResult: { items: [ACTIVE_CERTIFICATE] },
    })

    const response = await fixture.handle(certificateGetRequest())

    expect(await response.json()).toEqual({
      data: [expectedMetadata(ACTIVE_CERTIFICATE)],
      page: { nextCursor: null },
    })
  })

  test('accepts the exact limit boundaries', async () => {
    for (const limit of [1, 100]) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(certificateGetRequest({ query: `?limit=${limit}` }))

      expect(response.status).toBe(200)
      expect(fixture.listCalls[0]?.limit).toBe(limit)
    }
  })

  test('decodes one canonical base64url JSON tuple cursor', async () => {
    const fixture = await createDigitalCertificatesHttpFixture()
    const cursor = encodeCursor(NEXT_CURSOR)

    const response = await fixture.handle(certificateGetRequest({ query: `?cursor=${cursor}` }))

    expect(response.status).toBe(200)
    expect(fixture.listCalls[0]).toEqual({
      context: COMPANY_CONTEXT,
      cursor: NEXT_CURSOR,
      limit: 25,
    })
  })

  test('rejects invalid, unknown and duplicated queries', async () => {
    for (const query of invalidQueries()) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(certificateGetRequest({ query }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.listCalls).toHaveLength(0)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  test('rejects non-canonical cursors without querying', async () => {
    for (const cursor of invalidCursors()) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(certificateGetRequest({ query: `?cursor=${cursor}` }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.listCalls).toHaveLength(0)
    }
  })
})

function assertMetadataOnly(serialized: string): void {
  for (const forbidden of [
    'certificatebase64',
    'password',
    'secretenvelope',
    'ciphertext',
    'keyid',
    'fingerprint',
    'cnpj',
    'createdat',
  ]) {
    expect(serialized.toLowerCase()).not.toContain(forbidden)
  }
}

function invalidQueries(): readonly string[] {
  return [
    '?limit=0',
    '?limit=01',
    '?limit=101',
    '?limit=1.5',
    '?limit=abc',
    '?limit=25&limit=26',
    `?companyId=${OTHER_COMPANY_ID}`,
    '?unknown=value',
    '?cursor=one&cursor=two',
  ]
}

function invalidCursors(): readonly string[] {
  return [
    'not_base64url!',
    Buffer.from('not-json').toString('base64url'),
    Buffer.from(JSON.stringify(['2026-07-20T10:00:00.000Z'])).toString('base64url'),
    Buffer.from(
      JSON.stringify([NEXT_CURSOR.createdAt.toISOString(), NEXT_CURSOR.id, 'extra']),
    ).toString('base64url'),
    Buffer.from(JSON.stringify(['invalid-date', NEXT_CURSOR.id])).toString('base64url'),
    Buffer.from(JSON.stringify(['2026-07-20T10:00:00Z', NEXT_CURSOR.id])).toString('base64url'),
    Buffer.from(JSON.stringify([NEXT_CURSOR.createdAt.toISOString(), 'not-a-uuid'])).toString(
      'base64url',
    ),
    `${encodeCursor(NEXT_CURSOR)}=`,
  ]
}
