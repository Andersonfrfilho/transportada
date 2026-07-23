/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  DOCUMENT_DETAIL,
  DOCUMENT_ELIGIBILITY,
  DOCUMENT_SUMMARY,
  IMPORT_DETAIL,
  serializeDocumentSummary,
  serializeImportDetail,
  serializeImportSummary,
  UPLOAD_RESPONSE,
} from '../fixtures/nfe-http-payload.fixture'
import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import {
  documentDetailRequest,
  documentEligibilityRequest,
  documentsListRequest,
  importDetailRequest,
  importsListRequest,
  responseApiError,
} from '../fixtures/nfe-http-request.fixture'
import { COMPANY_CONTEXT, IMPORT_ID } from '../fixtures/nfe-import-application.fixture'

describe('nfe http listing and detail contract', () => {
  test('lists imports with validated cursor/limit and stable response serialization', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      importsListRequest({
        query: '?cursor=2026-07-22T13:39:00.000Z::00000000-0000-4000-8000-000000000099&limit=25',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [serializeImportSummary(UPLOAD_RESPONSE)],
      page: { nextCursor: '2026-07-22T13:40:00.000Z::00000000-0000-4000-8000-000000000207' },
    })
    expect(fixture.importListCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: '2026-07-22T13:39:00.000Z::00000000-0000-4000-8000-000000000099',
        limit: 25,
      },
    ])
  })

  test('rejects invalid import listing cursors and limits before application work', async () => {
    const fixture = await createNfeHttpFixture()

    for (const query of ['?limit=0', '?limit=101', '?cursor=not-a-cursor']) {
      const response = await fixture.handle(importsListRequest({ query }))
      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    }
    expect(fixture.importListCalls).toEqual([])
  })

  test('returns import detail with item-level safe state and without xml fields', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(importDetailRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ data: serializeImportDetail(IMPORT_DETAIL) })
    expect(fixture.importGetCalls).toEqual([{ context: COMPANY_CONTEXT, importId: IMPORT_ID }])
    expect(JSON.stringify(body)).not.toContain('"xml"')
    expect(JSON.stringify(body)).not.toContain('"content"')
  })

  test('lists and details documents with decimal strings and safe metadata only', async () => {
    const fixture = await createNfeHttpFixture()

    const listResponse = await fixture.handle(
      documentsListRequest({
        query: '?cursor=2026-07-22T14:00:00.000Z::00000000-0000-4000-8000-000000000230&limit=10',
      }),
    )
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual({
      data: [serializeDocumentSummary(DOCUMENT_SUMMARY)],
      page: { nextCursor: '2026-07-22T14:01:00.000Z::00000000-0000-4000-8000-000000000230' },
    })

    const detailResponse = await fixture.handle(documentDetailRequest())
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual({
      data: serializeDocumentSummary(DOCUMENT_DETAIL),
    })
    expect(fixture.documentListCalls[0]).toEqual({
      context: COMPANY_CONTEXT,
      cursor: '2026-07-22T14:00:00.000Z::00000000-0000-4000-8000-000000000230',
      limit: 10,
    })
  })

  test('returns structural document eligibility without inventing fiscal rules', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentEligibilityRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: DOCUMENT_ELIGIBILITY })
    expect(fixture.documentEligibilityCalls[0]).toEqual({
      context: COMPANY_CONTEXT,
      documentId: DOCUMENT_SUMMARY.id,
    })
  })
})
