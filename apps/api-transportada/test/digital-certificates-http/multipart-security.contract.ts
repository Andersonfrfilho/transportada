/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  byteStream,
  multipartBodyOfSize,
  observedByteStream,
  replaceMultipartPart,
} from '../fixtures/digital-certificates-http-multipart.fixture'
import {
  certificatePostRequest,
  createDigitalCertificatesHttpFixture,
  rawMultipartRequest,
  responseApiError,
} from '../fixtures/digital-certificates-http.fixture'

const APPLICATION_LIMIT = 1_048_576
const MULTIPART_CONTENT_TYPE = 'multipart/form-data; boundary=transportada-synthetic-boundary'

describe('POST /digital-certificates multipart security contract', () => {
  test('accepts exactly 1 MiB and cancels the next streamed chunk before formData', async () => {
    const exactBody = multipartBodyOfSize(APPLICATION_LIMIT)
    const oversized = observedByteStream({
      bytes: multipartBodyOfSize(APPLICATION_LIMIT + 512 * 1024),
    })
    const accepted = await createDigitalCertificatesHttpFixture()
    const rejected = await createDigitalCertificatesHttpFixture()

    const acceptedResponse = await accepted.handle(
      certificatePostRequest({
        body: byteStream(exactBody),
        contentType: MULTIPART_CONTENT_TYPE,
        events: accepted.events,
      }),
    )
    const rejectedResponse = await rejected.handle(
      certificatePostRequest({
        body: oversized.body,
        contentType: MULTIPART_CONTENT_TYPE,
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

  test('preserves 413 when cancelling an oversized stream fails', async () => {
    const fixture = await createDigitalCertificatesHttpFixture()
    const oversized = observedByteStream({
      bytes: multipartBodyOfSize(APPLICATION_LIMIT + 512 * 1024),
      cancelError: new Error('synthetic cancel failure'),
    })

    const response = await fixture.handle(
      certificatePostRequest({
        body: oversized.body,
        contentType: MULTIPART_CONTENT_TYPE,
      }),
    )

    expect(response.status).toBe(413)
    expect((await responseApiError(response)).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(oversized.wasCancelled()).toBe(true)
  })

  test('validates UTF-8 from the real password part instead of certificate bytes', async () => {
    const falseMarker = new TextEncoder().encode(
      'certificateContent-Disposition: form-data; name="password"\r\n\r\nfake-password',
    )
    const parts = replaceMultipartPart({ name: 'certificate', value: falseMarker }).map((part) =>
      part.name === 'password' ? { ...part, value: Uint8Array.from([0xc3, 0x28]) } : part,
    )
    const fixture = await createDigitalCertificatesHttpFixture()

    const response = await fixture.handle(rawMultipartRequest({ parts }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.replaceCalls).toHaveLength(0)
  })
})
