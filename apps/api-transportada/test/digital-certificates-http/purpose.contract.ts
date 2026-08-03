/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_CONTEXT } from '../fixtures/company-settings-application.fixture'
import {
  SYNTHETIC_CERTIFICATE,
  SYNTHETIC_PASSWORD,
} from '../fixtures/digital-certificates-http-payload.fixture'
import {
  certificateDeleteRequest,
  createDigitalCertificatesHttpFixture,
  rawMultipartRequest,
  responseApiError,
  validMultipartParts,
} from '../fixtures/digital-certificates-http.fixture'

describe('digital certificate purpose contract', () => {
  test('accepts an mdfe certificate upload and forwards the purpose', async () => {
    const fixture = await createDigitalCertificatesHttpFixture()

    const response = await fixture.handle(
      rawMultipartRequest({ parts: validMultipartParts('mdfe') }),
    )

    expect(response.status).toBe(201)
    expect(fixture.replaceCalls).toEqual([
      {
        certificate: SYNTHETIC_CERTIFICATE,
        context: COMPANY_CONTEXT,
        correlationId: 'certificate-http-correlation',
        idempotencyKey: 'certificate-http-0001',
        password: SYNTHETIC_PASSWORD,
        purpose: 'mdfe',
      },
    ])
  })

  test('rejects an unknown certificate purpose before application work', async () => {
    for (const purpose of ['nfe', 'MDFE', '', 'cte,mdfe']) {
      const fixture = await createDigitalCertificatesHttpFixture()

      const response = await fixture.handle(
        rawMultipartRequest({ parts: validMultipartParts(purpose) }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.replaceCalls).toHaveLength(0)
    }
  })

  // Aposentar o certificado errado tira a empresa do ar em um documento fiscal: o alvo é explícito
  test('retires the certificate named in the query and never guesses a purpose', async () => {
    for (const purpose of ['cte', 'mdfe'] as const) {
      const fixture = await createDigitalCertificatesHttpFixture()

      const response = await fixture.handle(
        certificateDeleteRequest({ query: `?purpose=${purpose}` }),
      )

      expect(response.status).toBe(200)
      expect(fixture.retireCalls).toEqual([
        {
          context: COMPANY_CONTEXT,
          correlationId: 'certificate-http-correlation',
          purpose,
        },
      ])
    }
  })

  test('rejects a retirement without an explicit or known purpose', async () => {
    for (const query of [
      '',
      '?purpose=',
      '?purpose=nfe',
      '?purpose=cte&purpose=mdfe',
      '?limit=1',
    ]) {
      const fixture = await createDigitalCertificatesHttpFixture()

      const response = await fixture.handle(certificateDeleteRequest({ query }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.retireCalls).toHaveLength(0)
    }
  })
})
