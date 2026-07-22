/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { HTTP_ERROR } from '../../src/shared/api.constant'
import { ApiError } from '../../src/shared/api.error'
import { serializeImportSummary, UPLOAD_RESPONSE } from '../fixtures/nfe-http-payload.fixture'
import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import {
  distributionRequest,
  rawUploadMultipartRequest,
  responseApiError,
  uploadImportRequest,
  validUploadParts,
} from '../fixtures/nfe-http-request.fixture'
import { COMPANY_CONTEXT, IDEMPOTENCY_KEY } from '../fixtures/nfe-import-application.fixture'

describe('nfe http import request and limits contract', () => {
  test('accepts multipart xml/zip upload and returns 202 with a safe import summary', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      uploadImportRequest({ correlationId: 'client-correlation-id' }),
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ data: serializeImportSummary(UPLOAD_RESPONSE) })
    expect(response.headers.get('x-correlation-id')).toBe('client-correlation-id')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.requestUploadCalls).toHaveLength(1)
    expect(fixture.requestUploadCalls[0]).toMatchObject({
      context: COMPANY_CONTEXT,
      correlationId: 'client-correlation-id',
      idempotencyKey: IDEMPOTENCY_KEY,
    })
    expect(
      fixture.requestUploadCalls[0]?.files.map((file) => [file.name, file.contentType]),
    ).toEqual([
      ['first.xml', 'application/xml'],
      ['batch.zip', 'application/zip'],
    ])
  })

  test('accepts distribution start as a separate idempotent 202 route', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(distributionRequest())

    expect(response.status).toBe(202)
    expect(fixture.requestDistributionCalls).toHaveLength(1)
    expect(fixture.requestDistributionCalls[0]).toMatchObject({
      context: COMPANY_CONTEXT,
      idempotencyKey: 'nfe-distribution-0001',
    })
  })

  test.each(['', ' '.repeat(5), 'x'.repeat(257)])(
    'rejects invalid idempotency keys before application work',
    async (idempotencyKey) => {
      const fixture = await createNfeHttpFixture()

      const response = await fixture.handle(uploadImportRequest({ idempotencyKey }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.requestUploadCalls).toEqual([])
    },
  )

  test('rejects multipart selectors that try to choose company or import ownership', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      rawUploadMultipartRequest({
        parts: [...validUploadParts(), { name: 'companyId', value: 'attacker-tenant' }],
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.requestUploadCalls).toEqual([])
  })

  test('rejects malformed multipart payloads and oversized upload bodies safely', async () => {
    const malformedFixture = await createNfeHttpFixture()
    const malformed = await malformedFixture.handle(
      rawUploadMultipartRequest({
        parts: [{ name: 'files', value: 'not-a-file-part' }],
      }),
    )
    expect(malformed.status).toBe(400)
    expect((await responseApiError(malformed)).error.code).toBe('INVALID_REQUEST')

    const oversizedFixture = await createNfeHttpFixture({
      requestUploadError: new ApiError(HTTP_ERROR.payloadTooLarge),
    })
    const oversized = await oversizedFixture.handle(uploadImportRequest())
    expect(oversized.status).toBe(413)
    expect((await responseApiError(oversized)).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(oversized.headers.get('cache-control')).toBe('no-store')
  })
})
