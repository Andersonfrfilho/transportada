/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_CONTEXT, OTHER_COMPANY_ID } from '../fixtures/company-settings-application.fixture'
import {
  SYNTHETIC_CERTIFICATE,
  SYNTHETIC_PASSWORD,
} from '../fixtures/digital-certificates-http-payload.fixture'
import {
  byteStream,
  invalidContentTypes,
  invalidMultipartParts,
  invalidPasswords,
  multipartBodyOfSize,
  observedByteStream,
  replaceMultipartPart,
} from '../fixtures/digital-certificates-http-multipart.fixture'
import {
  certificatePostRequest,
  createDigitalCertificatesHttpFixture,
  rawMultipartRequest,
  responseApiError,
  validMultipartParts,
} from '../fixtures/digital-certificates-http.fixture'

const APPLICATION_LIMIT = 1_048_576
describe('POST /digital-certificates multipart contract', () => {
  test('accepts one exact normal and chunked multipart body', async () => {
    for (const streamed of [false, true]) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(
        rawMultipartRequest({ events: fixture.events, parts: validMultipartParts(), streamed }),
      )

      expect(response.status).toBe(201)
      expect(fixture.events.slice(0, 3)).toEqual(['authenticate', 'tenant', 'authorize'])
      expect(fixture.replaceCalls).toEqual([
        {
          certificate: SYNTHETIC_CERTIFICATE,
          context: COMPANY_CONTEXT,
          correlationId: 'certificate-http-correlation',
          idempotencyKey: 'certificate-http-0001',
          password: SYNTHETIC_PASSWORD,
          purpose: 'cte',
        },
      ])
    }
  })

  test('ignores a foreign tenant header and uses the authenticated context', async () => {
    const fixture = await createDigitalCertificatesHttpFixture()
    const request = rawMultipartRequest({ parts: validMultipartParts() })
    request.headers.set('x-company-id', OTHER_COMPANY_ID)

    const response = await fixture.handle(request)

    expect(response.status).toBe(201)
    expect(fixture.replaceCalls[0]?.context).toEqual(COMPANY_CONTEXT)
  })

  test('rejects companyId multipart and query selectors before application work', async () => {
    const requests = [
      rawMultipartRequest({
        parts: [...validMultipartParts(), { name: 'companyId', value: OTHER_COMPANY_ID }],
      }),
      rawMultipartRequest({
        parts: validMultipartParts(),
        query: `?companyId=${OTHER_COMPANY_ID}`,
      }),
    ]

    for (const request of requests) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(request)

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.replaceCalls).toHaveLength(0)
    }
  })

  test('rejects every duplicated required part', async () => {
    for (const name of ['certificate', 'password', 'purpose']) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const duplicate = validMultipartParts().find((part) => part.name === name)
      if (duplicate === undefined) throw new Error('Expected synthetic multipart part')

      const response = await fixture.handle(
        rawMultipartRequest({ parts: [...validMultipartParts(), duplicate] }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.replaceCalls).toHaveLength(0)
    }
  })

  test('rejects unknown, missing, empty and invalid-purpose parts', async () => {
    for (const parts of invalidMultipartParts()) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(rawMultipartRequest({ parts }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.replaceCalls).toHaveLength(0)
    }
  })

  test('accepts exact ASCII and multibyte UTF-8 password boundaries', async () => {
    for (const password of [
      new TextEncoder().encode('x'),
      new TextEncoder().encode('é'.repeat(128)),
    ]) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(
        rawMultipartRequest({
          parts: replaceMultipartPart({ name: 'password', value: password }),
        }),
      )

      expect(response.status).toBe(201)
      expect(fixture.replaceCalls[0]?.password).toEqual(password)
    }
  })

  test('rejects empty, oversized and malformed UTF-8 passwords', async () => {
    for (const password of invalidPasswords()) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(
        rawMultipartRequest({
          parts: replaceMultipartPart({ name: 'password', value: password }),
        }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.replaceCalls).toHaveLength(0)
    }
  })

  test('rejects wrong or boundary-less multipart Content-Type', async () => {
    for (const [contentType, body] of invalidContentTypes()) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(certificatePostRequest({ body, contentType }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.replaceCalls).toHaveLength(0)
    }
  })

  test('accepts exactly 1 MiB and rejects the next streamed byte before formData', async () => {
    const exactBody = multipartBodyOfSize(APPLICATION_LIMIT)
    const oversized = observedByteStream(multipartBodyOfSize(APPLICATION_LIMIT + 512 * 1024))
    const accepted = await createDigitalCertificatesHttpFixture()
    const rejected = await createDigitalCertificatesHttpFixture()

    const acceptedResponse = await accepted.handle(
      certificatePostRequest({
        body: byteStream(exactBody),
        contentType: 'multipart/form-data; boundary=transportada-synthetic-boundary',
        events: accepted.events,
      }),
    )
    const rejectedResponse = await rejected.handle(
      certificatePostRequest({
        body: oversized.body,
        contentType: 'multipart/form-data; boundary=transportada-synthetic-boundary',
        events: rejected.events,
      }),
    )

    expect(acceptedResponse.status).toBe(201)
    expect(rejectedResponse.status).toBe(413)
    expect((await responseApiError(rejectedResponse)).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(rejected.events.slice(0, 3)).toEqual(['authenticate', 'tenant', 'authorize'])
    expect(rejected.events).toContain('body')
    expect(rejected.events).not.toContain('formData')
    expect(rejected.replaceCalls).toHaveLength(0)
    expect(oversized.pulls()).toBe(17)
    expect(oversized.wasCancelled()).toBe(true)
  })

  test('rejects Content-Length above 1 MiB without pulling the body', async () => {
    const fixture = await createDigitalCertificatesHttpFixture()
    const request = certificatePostRequest({ events: fixture.events })
    request.headers.set('content-length', String(APPLICATION_LIMIT + 1))

    const response = await fixture.handle(request)

    expect(response.status).toBe(413)
    expect((await responseApiError(response)).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(fixture.events).not.toContain('body')
    expect(fixture.events).not.toContain('formData')
    expect(fixture.replaceCalls).toHaveLength(0)
  })
})
