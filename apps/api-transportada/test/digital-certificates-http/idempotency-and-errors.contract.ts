/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  DigitalCertificateIdempotencyConflictError,
  DigitalCertificateOperationFailedError,
  DigitalCertificateRejectedError,
} from '../../src/companies/domain/digital-certificate.error'
import {
  ACTIVE_CERTIFICATE,
  expectedMetadata,
  SYNTHETIC_CERTIFICATE,
  SYNTHETIC_PASSWORD,
} from '../fixtures/digital-certificates-http-payload.fixture'
import {
  certificatePostRequest,
  createDigitalCertificatesHttpFixture,
  DIGITAL_CERTIFICATES_PATH,
  FRONTEND_ORIGIN,
  responseApiError,
} from '../fixtures/digital-certificates-http.fixture'

describe('POST /digital-certificates idempotency and error contract', () => {
  test('returns 201 then replay 200 with the same safe DTO', async () => {
    const fixture = await createDigitalCertificatesHttpFixture()
    const first = await fixture.handle(certificatePostRequest())
    const replay = await fixture.handle(certificatePostRequest())
    const responses = [first, replay]

    expect(responses.map((response) => response.status)).toEqual([201, 200])
    const bodies = await Promise.all(responses.map((response) => response.json()))
    expect(bodies).toEqual([
      { data: expectedMetadata(ACTIVE_CERTIFICATE) },
      { data: expectedMetadata(ACTIVE_CERTIFICATE) },
    ])
    expect(responses[0]?.headers.get('cache-control')).toBe('no-store')
  })

  test('accepts the exact idempotency key boundaries', async () => {
    for (const idempotencyKey of ['idempotency-._:1', 'x'.repeat(128)]) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(certificatePostRequest({ idempotencyKey }))

      expect(response.status).toBe(201)
      expect(fixture.replaceCalls[0]?.idempotencyKey).toBe(idempotencyKey)
    }
  })

  test('rejects invalid idempotency keys before application work', async () => {
    for (const idempotencyKey of invalidIdempotencyKeys()) {
      const fixture = await createDigitalCertificatesHttpFixture()
      const response = await fixture.handle(certificatePostRequest({ idempotencyKey }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.replaceCalls).toHaveLength(0)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  test('maps application failures to safe stable errors', async () => {
    for (const [error, status, code] of expectedErrors()) {
      const fixture = await createDigitalCertificatesHttpFixture({ replaceError: error })
      const correlationId = 'certificate-client-correlation'
      const response = await fixture.handle(
        certificatePostRequest({ correlationId, origin: FRONTEND_ORIGIN }),
      )
      const serialized = await response.text()

      expect(response.status).toBe(status)
      expect(JSON.parse(serialized).error).toMatchObject({ code, correlationId })
      expect(response.headers.get('x-correlation-id')).toBe(correlationId)
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
      expect(response.headers.get('cache-control')).toBe('no-store')
      assertNoSecrets(serialized)
    }
  })

  test('reduces an unexpected failure and request logs to safe metadata', async () => {
    const fixture = await createDigitalCertificatesHttpFixture({
      replaceError: new Error('pfx password envelope keyId fingerprint cnpj private-provider'),
    })
    const response = await fixture.handle(certificatePostRequest())
    const serialized = await response.text()
    const logs = JSON.stringify(fixture.logs)

    expect(response.status).toBe(500)
    expect(JSON.parse(serialized).error.code).toBe('INTERNAL_ERROR')
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({ pathname: DIGITAL_CERTIFICATES_PATH, status: 500 }),
    )
    assertNoSecrets(serialized)
    assertNoSecrets(logs)
  })
})

function assertNoSecrets(serialized: string): void {
  for (const forbidden of [
    'pfx',
    'password',
    'envelope',
    'keyid',
    'fingerprint',
    'cnpj',
    'private-provider',
    new TextDecoder().decode(SYNTHETIC_CERTIFICATE),
    Buffer.from(SYNTHETIC_CERTIFICATE).toString('base64'),
    new TextDecoder().decode(SYNTHETIC_PASSWORD),
  ]) {
    expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase())
  }
}

function invalidIdempotencyKeys(): readonly string[] {
  return ['', 'short', 'invalid key spaces', `${'x'.repeat(15)}/`, 'á'.repeat(16), 'x'.repeat(129)]
}

function expectedErrors(): readonly (readonly [Error, number, string])[] {
  return [
    [new DigitalCertificateRejectedError(), 400, 'DIGITAL_CERTIFICATE_REJECTED'],
    [new DigitalCertificateIdempotencyConflictError(), 409, 'IDEMPOTENCY_KEY_REUSED'],
    [new DigitalCertificateOperationFailedError(), 500, 'DIGITAL_CERTIFICATE_OPERATION_FAILED'],
  ]
}
