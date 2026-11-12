/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { jsonRequest, responseApiError } from '../fixtures/fleet-http-payload.fixture.js'
import {
  ACCESS_KEY,
  ACCESS_KEY_WITH_WRONG_DV,
  COMPANY_CONTEXT,
  DOCUMENT_ID,
  OTHER_ACCESS_KEY,
} from '../fixtures/nfe-access-key-lookup.fixture.js'
import { createNfeDocumentAccessKeyCheckHttpFixture } from '../fixtures/nfe-document-access-key-check-http.fixture.js'

const CHECKS_PATH = '/nfe-documents/access-key-checks'

function postCheck(body: unknown): Request {
  return jsonRequest({ body, method: 'POST', path: CHECKS_PATH })
}

describe('POST /nfe-documents/access-key-checks contract', () => {
  test('200 with one entry per key, forwarding the tenant context and the canonical keys', async () => {
    const entries = [
      { accessKey: ACCESS_KEY, documentId: DOCUMENT_ID },
      { accessKey: OTHER_ACCESS_KEY, documentId: null },
    ]
    const fixture = createNfeDocumentAccessKeyCheckHttpFixture({ checkResult: entries })

    const response = await fixture.handle(
      postCheck({ accessKeys: [` ${ACCESS_KEY} `, OTHER_ACCESS_KEY] }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: entries })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.checkCalls).toHaveLength(1)
    expect(fixture.checkCalls[0]).toMatchObject({
      accessKeys: [ACCESS_KEY, OTHER_ACCESS_KEY],
      context: { companyId: COMPANY_CONTEXT.companyId },
    })
  })

  test('duplicates, even in another case, reach the application once and in input order', async () => {
    const fixture = createNfeDocumentAccessKeyCheckHttpFixture({ checkResult: [] })

    await fixture.handle(
      postCheck({
        accessKeys: [OTHER_ACCESS_KEY, ACCESS_KEY, OTHER_ACCESS_KEY.toLowerCase(), ACCESS_KEY],
      }),
    )

    expect(fixture.checkCalls[0]?.accessKeys).toEqual([OTHER_ACCESS_KEY, ACCESS_KEY])
  })

  test('accepts exactly 200 keys', async () => {
    const fixture = createNfeDocumentAccessKeyCheckHttpFixture({ checkResult: [] })

    const response = await fixture.handle(
      postCheck({ accessKeys: Array.from({ length: 200 }, () => ACCESS_KEY) }),
    )

    expect(response.status).toBe(200)
  })

  test('400 INVALID_ACCESS_KEY lists every invalid key at once, before any application work', async () => {
    const fixture = createNfeDocumentAccessKeyCheckHttpFixture()

    const response = await fixture.handle(
      postCheck({
        accessKeys: [ACCESS_KEY, ACCESS_KEY_WITH_WRONG_DV, ACCESS_KEY.slice(0, 43), ''],
      }),
    )

    expect(response.status).toBe(400)
    const error = await responseApiError(response)
    expect(error.code).toBe('INVALID_ACCESS_KEY')
    expect(error.details?.map((detail) => detail.field)).toEqual([
      'accessKeys.1',
      'accessKeys.2',
      'accessKeys.3',
    ])
    expect(JSON.stringify(error)).not.toContain(ACCESS_KEY_WITH_WRONG_DV)
    expect(JSON.stringify(error.details)).not.toContain(ACCESS_KEY.slice(0, 43))
    expect(fixture.checkCalls).toEqual([])
  })

  test.each([
    ['a missing accessKeys', {}],
    ['an empty list', { accessKeys: [] }],
    ['201 keys', { accessKeys: Array.from({ length: 201 }, () => ACCESS_KEY) }],
    ['a non-string item', { accessKeys: [35260811111111] }],
    ['an item longer than 64 characters', { accessKeys: ['9'.repeat(65)] }],
    [
      'a body that tries to choose the company',
      { accessKeys: [ACCESS_KEY], companyId: 'attacker' },
    ],
  ])('400 INVALID_REQUEST for %s', async (_label, body) => {
    const fixture = createNfeDocumentAccessKeyCheckHttpFixture()

    const response = await fixture.handle(postCheck(body))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.checkCalls).toEqual([])
  })

  test('403 for a caller without invoices.read', async () => {
    const fixture = createNfeDocumentAccessKeyCheckHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(postCheck({ accessKeys: [ACCESS_KEY] }))

    expect(response.status).toBe(403)
    expect(fixture.checkCalls).toEqual([])
  })

  test('the route has a per-user ceiling', () => {
    const fixture = createNfeDocumentAccessKeyCheckHttpFixture()
    const route = fixture.routes.find((candidate) => candidate.method === 'POST')

    expect(route?.rateLimit).toEqual({
      maxRequests: 120,
      scope: 'nfe-document-access-key-checks',
      store: 'postgres',
      windowSeconds: 60,
    })
  })

  test('the fixed path is not read as a document id by the /nfe-documents/:id routes', async () => {
    const fixture = createNfeDocumentAccessKeyCheckHttpFixture({ checkResult: [] })

    await fixture.handle(postCheck({ accessKeys: [ACCESS_KEY] }))
    await fixture.handle(jsonRequest({ method: 'GET', path: CHECKS_PATH }))

    expect(fixture.checkCalls).toHaveLength(1)
    expect(fixture.getDocumentCalls).toEqual([])
  })
})
