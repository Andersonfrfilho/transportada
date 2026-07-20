/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CompanyFiscalProfileConflictError,
  CompanySettingsVersionConflictError,
  FiscalSequenceLockedError,
} from '../../src/companies/domain/company-settings.error'
import { ApiError } from '../../src/shared/api.error'
import {
  COMPANY_SETTINGS_PATH,
  createCompanySettingsHttpFixture,
  FRONTEND_ORIGIN,
  getSettingsRequest,
  patchSettingsRequest,
  responseApiError,
} from '../fixtures/company-settings-http.fixture'

describe('/company-settings security and CORS contract', () => {
  test.each(['GET', 'PATCH'])(
    'requires settings.manage before %s parsing/handling',
    async (method) => {
      const fixture = await createCompanySettingsHttpFixture({
        permissions: new Set(['invoices.read']),
      })

      const request =
        method === 'GET' ? getSettingsRequest() : patchSettingsRequest({ body: '{invalid-json' })
      const response = await fixture.handle(request)

      expect(response.status).toBe(403)
      expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
      expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
      expect(fixture.getCalls).toHaveLength(0)
      expect(fixture.updateCalls).toHaveLength(0)
      expect(response.headers.get('cache-control')).toBe('no-store')
    },
  )

  test.each([
    [
      new CompanyFiscalProfileConflictError(),
      'FISCAL_SETTINGS_CONFLICT',
      'Company fiscal settings conflict',
    ],
    [
      new CompanySettingsVersionConflictError(),
      'FISCAL_SETTINGS_VERSION_CONFLICT',
      'Company fiscal settings version conflict',
    ],
    [new FiscalSequenceLockedError(), 'FISCAL_SEQUENCE_LOCKED', 'Fiscal sequence is locked'],
    [
      new ApiError({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key cannot be reused',
        status: 409,
      }),
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key cannot be reused',
    ],
  ] as const)('returns one safe 409 for application conflicts', async (error, code, message) => {
    const fixture = await createCompanySettingsHttpFixture({ updateError: error })
    const correlationId = 'company-settings-conflict_123'

    const response = await fixture.handle(
      patchSettingsRequest({ correlationId, origin: FRONTEND_ORIGIN }),
    )
    const serialized = await response.text()

    expect(response.status).toBe(409)
    expect(JSON.parse(serialized)).toEqual({
      error: {
        code,
        correlationId,
        message,
      },
    })
    expect(response.headers.get('x-correlation-id')).toBe(correlationId)
    expect(serialized).not.toContain('61156864000191')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
  })

  test('reduces an unexpected failure to a safe no-store 500', async () => {
    const fixture = await createCompanySettingsHttpFixture({
      updateError: new Error('postgresql://user:password@private/tenant'),
    })

    const response = await fixture.handle(patchSettingsRequest())
    const serialized = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(serialized).error.code).toBe('INTERNAL_ERROR')
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('tenant')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test.each([
    ['GET', 'Authorization'],
    ['PATCH', 'Authorization, Content-Type, Idempotency-Key'],
  ])('allows exact %s preflight without protected work', async (method, headers) => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(preflightRequest({ headers, method }))

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, PATCH')
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Authorization, Content-Type, Idempotency-Key',
    )
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.events).toEqual([])
  })

  test.each([
    ['https://attacker.example', 'PATCH', 'Authorization, Content-Type, Idempotency-Key'],
    [FRONTEND_ORIGIN, 'POST', 'Authorization'],
    [FRONTEND_ORIGIN, 'PATCH', 'Authorization, X-Company-Id'],
    [FRONTEND_ORIGIN, 'GET', 'Content-Type'],
    [FRONTEND_ORIGIN, 'PATCH', 'Authorization'],
    [FRONTEND_ORIGIN, 'PATCH', 'Authorization, Authorization, Content-Type'],
  ])('rejects unsafe preflight before authentication', async (origin, method, headers) => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(preflightRequest({ headers, method, origin }))

    expect(response.status).toBe(403)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.events).toEqual([])
  })

  test('applies no-store to GET and PATCH responses for clients without Origin', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const responses = await Promise.all([
      fixture.handle(getSettingsRequest()),
      fixture.handle(patchSettingsRequest()),
    ])

    for (const response of responses) {
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.has('access-control-allow-origin')).toBe(false)
    }
  })

  test('keeps no-store when company settings request metadata is invalid', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const request = getSettingsRequest()
    request.headers.set('content-length', 'invalid')

    const response = await fixture.handle(request)

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.events).toEqual([])
  })
})

type PreflightRequestParams = {
  readonly headers: string
  readonly method: string
  readonly origin?: string
}

function preflightRequest({
  headers,
  method,
  origin = FRONTEND_ORIGIN,
}: PreflightRequestParams): Request {
  return new Request(`http://localhost${COMPANY_SETTINGS_PATH}`, {
    headers: {
      origin,
      'access-control-request-headers': headers,
      'access-control-request-method': method,
    },
    method: 'OPTIONS',
  })
}
