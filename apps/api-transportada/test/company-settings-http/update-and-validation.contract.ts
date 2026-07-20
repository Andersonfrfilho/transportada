/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  COMPANY_SETTINGS,
  OTHER_COMPANY_ID,
} from '../fixtures/company-settings-application.fixture'
import {
  createCompanySettingsHttpFixture,
  GENERATED_CORRELATION_ID,
  patchSettingsRequest,
  responseApiError,
} from '../fixtures/company-settings-http.fixture'
import {
  EXPECTED_HTTP_SETTINGS_DATA,
  settingsBodyWith,
  VALID_HTTP_SETTINGS_BODY,
  VALID_IDEMPOTENCY_KEY,
} from '../fixtures/company-settings-http-payload.fixture'

describe('PATCH /company-settings HTTP contract', () => {
  test('parses one strict DTO and passes generated correlation plus authenticated context', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const request = patchSettingsRequest({
      query: `?companyId=${OTHER_COMPANY_ID}`,
    })
    request.headers.set('x-company-id', OTHER_COMPANY_ID)

    const response = await fixture.handle(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: EXPECTED_HTTP_SETTINGS_DATA })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(request.headers.has('x-correlation-id')).toBe(false)
    expect(fixture.updateCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: GENERATED_CORRELATION_ID,
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
        settings: COMPANY_SETTINGS,
      },
    ])
  })

  test('parses an optimistic version only from a canonical decimal string', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(
      patchSettingsRequest({
        body: settingsBodyWith({ path: 'expectedVersion', value: '42' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings.expectedVersion).toBe(42n)
  })

  test('propagates one valid client correlation ID to response and audit input', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const correlationId = 'client-settings-request_123'

    const response = await fixture.handle(patchSettingsRequest({ correlationId }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-correlation-id')).toBe(correlationId)
    expect(fixture.updateCalls[0]?.correlationId).toBe(correlationId)
  })

  test.each([
    ['companyId', { ...VALID_HTTP_SETTINGS_BODY, companyId: OTHER_COMPANY_ID }],
    ['top-level secret', { ...VALID_HTTP_SETTINGS_BODY, password: 'must-not-pass' }],
    ['profile property', settingsBodyWith({ path: 'profile.unknown', value: 'value' })],
    ['cte property', settingsBodyWith({ path: 'cte.model', value: 'cte' })],
  ])('rejects unknown %s before the use case', async (_name, body) => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(patchSettingsRequest({ body }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
