/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error'
import { jsonRequest, responseApiError } from '../fixtures/fleet-http-payload.fixture.js'
import { createNfeAccessKeyLookupHttpFixture } from '../fixtures/nfe-access-key-lookup-http.fixture.js'
import {
  ACCESS_KEY,
  ACCESS_KEY_WITH_WRONG_DV,
  COMPANY_CONTEXT,
  DOCUMENT_ID,
  LOOKUP_ID,
  QUEUED_VIEW,
  REFUSED_VIEW,
} from '../fixtures/nfe-access-key-lookup.fixture.js'

const LOOKUPS_PATH = '/nfe-access-key-lookups'

function postLookup(body: unknown): Request {
  return jsonRequest({ body, method: 'POST', path: LOOKUPS_PATH })
}

describe('POST /nfe-access-key-lookups contract', () => {
  test('201 with the queued lookup, forwarding the tenant context and the canonical key', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture({
      requestResult: { kind: 'created', lookup: { id: LOOKUP_ID, status: 'queued' } },
    })

    const response = await fixture.handle(postLookup({ accessKey: ` ${ACCESS_KEY} ` }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: LOOKUP_ID, status: 'queued' } })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.requestCalls).toHaveLength(1)
    expect(fixture.requestCalls[0]).toMatchObject({
      accessKey: ACCESS_KEY,
      context: { companyId: COMPANY_CONTEXT.companyId, userId: COMPANY_CONTEXT.userId },
      correlationId: 'fleet-http-correlation',
    })
  })

  test('200 found with the document id when the note is already registered', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture({
      requestResult: { documentId: DOCUMENT_ID, kind: 'found' },
    })

    const response = await fixture.handle(postLookup({ accessKey: ACCESS_KEY }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { documentId: DOCUMENT_ID, status: 'found' } })
  })

  test('200 with the existing lookup (active or recently refused)', async () => {
    for (const lookup of [QUEUED_VIEW, REFUSED_VIEW]) {
      const fixture = await createNfeAccessKeyLookupHttpFixture({
        requestResult: { kind: 'existing', lookup },
      })

      const response = await fixture.handle(postLookup({ accessKey: ACCESS_KEY }))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ data: lookup })
    }
  })

  test.each([
    ['43 digits', ACCESS_KEY.slice(0, 43)],
    ['45 digits', `${ACCESS_KEY}0`],
    ['a letter in a numeric position', `A${ACCESS_KEY.slice(1)}`],
    ['a wrong check digit', ACCESS_KEY_WITH_WRONG_DV],
    ['an empty string', ''],
  ])('400 INVALID_ACCESS_KEY for %s, before any application work', async (_label, accessKey) => {
    const fixture = await createNfeAccessKeyLookupHttpFixture()

    const response = await fixture.handle(postLookup({ accessKey }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_ACCESS_KEY')
    expect(fixture.requestCalls).toEqual([])
  })

  test.each([
    ['a missing accessKey', {}],
    ['a non-string accessKey', { accessKey: 35260811111111 }],
    ['a body that tries to choose the company', { accessKey: ACCESS_KEY, companyId: 'attacker' }],
  ])('400 INVALID_REQUEST for %s', async (_label, body) => {
    const fixture = await createNfeAccessKeyLookupHttpFixture()

    const response = await fixture.handle(postLookup(body))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.requestCalls).toEqual([])
  })

  test('429 NFE_ACCESS_KEY_LOOKUP_QUEUE_FULL carries the typed code when the company queue is full', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture({
      requestResult: new ApiError({
        code: 'NFE_ACCESS_KEY_LOOKUP_QUEUE_FULL',
        message: 'The company has too many NF-e access key lookups in progress',
        status: 429,
      }),
    })

    const response = await fixture.handle(postLookup({ accessKey: ACCESS_KEY }))

    expect(response.status).toBe(429)
    expect((await responseApiError(response)).code).toBe('NFE_ACCESS_KEY_LOOKUP_QUEUE_FULL')
  })

  test('403 for a caller with invoices.read but without invoices.import', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture({
      permissions: new Set(['invoices.read']),
    })

    const response = await fixture.handle(postLookup({ accessKey: ACCESS_KEY }))

    expect(response.status).toBe(403)
    expect(fixture.requestCalls).toEqual([])
  })

  test('the POST has a per-user ceiling and the GET does not', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture()
    const post = fixture.routes.find((route) => route.method === 'POST')
    const get = fixture.routes.find((route) => route.method === 'GET')

    expect(post?.rateLimit).toEqual({
      maxRequests: 120,
      scope: 'nfe-access-key-lookups-request',
      store: 'postgres',
      windowSeconds: 60,
    })
    expect(get?.rateLimit).toBeUndefined()
  })
})

describe('GET /nfe-access-key-lookups/:id contract', () => {
  test('200 with the lookup state, scoped by the authenticated company', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture({ getResult: REFUSED_VIEW })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUPS_PATH}/${LOOKUP_ID}` }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: REFUSED_VIEW })
    expect(fixture.getCalls).toHaveLength(1)
    expect(fixture.getCalls[0]).toMatchObject({
      context: { companyId: COMPANY_CONTEXT.companyId },
      lookupId: LOOKUP_ID,
    })
  })

  test('404 (never 403) when the lookup belongs to another company', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture({
      getResult: new ApiError({
        code: 'NFE_ACCESS_KEY_LOOKUP_NOT_FOUND',
        message: 'NF-e access key lookup not found',
        status: 404,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUPS_PATH}/${LOOKUP_ID}` }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('NFE_ACCESS_KEY_LOOKUP_NOT_FOUND')
  })

  test('404 for a malformed id, without touching the application', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUPS_PATH}/not-a-uuid` }),
    )

    expect(response.status).toBe(404)
    expect(fixture.getCalls).toEqual([])
  })

  test('403 for a caller without invoices.read', async () => {
    const fixture = await createNfeAccessKeyLookupHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUPS_PATH}/${LOOKUP_ID}` }),
    )

    expect(response.status).toBe(403)
    expect(fixture.getCalls).toEqual([])
  })
})
