/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createCompanySettingsHttpFixture,
  patchSettingsRequest,
  responseApiError,
  streamingPatchSettingsRequest,
} from '../fixtures/company-settings-http.fixture'
import {
  settingsBodyWith,
  VALID_HTTP_SETTINGS_BODY,
  VALID_IDEMPOTENCY_KEY,
} from '../fixtures/company-settings-http-payload.fixture'

describe('PATCH /company-settings boundary contract', () => {
  test.each([
    ['expectedVersion', '0'],
    ['expectedVersion', '01'],
    ['expectedVersion', 'not-a-number'],
    ['expectedVersion', '9223372036854775808'],
    ['expectedVersion', '12345678901234567890'],
    ['expectedVersion', 1],
    ['profile.legalName', ' '],
    ['profile.legalName', 'x'],
    ['profile.legalName', 'x'.repeat(201)],
    ['profile.tradeName', 'x'.repeat(201)],
    ['profile.cnpj', '1234567890123'],
    ['profile.cnpj', '123456789012345'],
    ['profile.cnpj', '1234567890123x'],
    ['profile.state', 'S'],
    ['profile.state', 'sp'],
    ['profile.state', 'SPA'],
    ['profile.cityIbgeCode', '123456'],
    ['profile.cityIbgeCode', '12345678'],
    ['profile.postalCode', '1234567'],
    ['profile.postalCode', '123456789'],
    ['profile.taxRegime', '4'],
    ['profile.rntrc', ' '],
    ['profile.rntrc', 'x'.repeat(21)],
    ['profile.stateRegistration', 'x'.repeat(21)],
    ['profile.municipalRegistration', 'x'.repeat(21)],
    ['profile.street', 'x'],
    ['profile.street', 'x'.repeat(201)],
    ['profile.number', ' '],
    ['profile.number', 'x'.repeat(21)],
    ['profile.complement', 'x'.repeat(101)],
    ['profile.district', ' '],
    ['profile.district', 'x'.repeat(101)],
    ['profile.city', 'x'],
    ['profile.city', 'x'.repeat(101)],
    ['profile.phone', 'x'.repeat(21)],
    ['profile.email', 'x'.repeat(255)],
    ['cte.environment', 'test'],
    ['cte.series', '0'],
    ['cte.series', '01'],
    ['cte.series', 'not-a-number'],
    ['cte.series', '9223372036854775808'],
    ['cte.series', '12345678901234567890'],
    ['cte.series', 1],
    ['cte.nextNumber', '0'],
    ['cte.nextNumber', '01'],
    ['cte.nextNumber', 'not-a-number'],
    ['cte.nextNumber', '9223372036854775808'],
    ['cte.nextNumber', '12345678901234567890'],
    ['cte.nextNumber', 1],
  ])('rejects invalid bounded field %s=%s', async (path, value) => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(
      patchSettingsRequest({ body: settingsBodyWith({ path, value }) }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
  })

  test.each(['x'.repeat(16), 'x'.repeat(128)])(
    'accepts the exact idempotency key boundary',
    async (idempotencyKey) => {
      const fixture = await createCompanySettingsHttpFixture()
      const response = await fixture.handle(patchSettingsRequest({ idempotencyKey }))

      expect(response.status).toBe(200)
      expect(fixture.updateCalls[0]?.idempotencyKey).toBe(idempotencyKey)
    },
  )

  test('accepts the maximum signed bigint as a canonical 19-digit boundary', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const maximum = '9223372036854775807'
    const body = settingsBodyWith({
      path: 'expectedVersion',
      value: maximum,
    }) as Record<string, unknown>
    const cte = body.cte as Record<string, unknown>
    cte.series = maximum
    cte.nextNumber = maximum

    const response = await fixture.handle(patchSettingsRequest({ body }))

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings).toMatchObject({
      cte: { nextNumber: BigInt(maximum), series: BigInt(maximum) },
      expectedVersion: BigInt(maximum),
    })
  })

  test.each([
    ['', 'application/json', VALID_HTTP_SETTINGS_BODY],
    ['short', 'application/json', VALID_HTTP_SETTINGS_BODY],
    ['invalid key spaces', 'application/json', VALID_HTTP_SETTINGS_BODY],
    ['x'.repeat(129), 'application/json', VALID_HTTP_SETTINGS_BODY],
    [VALID_IDEMPOTENCY_KEY, 'text/plain', VALID_HTTP_SETTINGS_BODY],
    [VALID_IDEMPOTENCY_KEY, 'application/json', ''],
    [VALID_IDEMPOTENCY_KEY, 'application/json', '{invalid-json'],
  ])('rejects invalid idempotency/content boundary', async (idempotencyKey, contentType, body) => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(
      patchSettingsRequest({ body, contentType, idempotencyKey }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
  })

  test('rejects a body above the application limit before protected work', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const request = patchSettingsRequest({ body: 'x'.repeat(1_048_577) })
    request.headers.set('content-length', '1048577')

    const response = await fixture.handle(request)

    expect(response.status).toBe(413)
    expect((await responseApiError(response)).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(fixture.events).toEqual([])
    expect(fixture.updateCalls).toHaveLength(0)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('rejects a streamed body above 1 MiB without trusting Content-Length', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(streamingPatchSettingsRequest(1_048_577))

    expect(response.status).toBe(413)
    expect((await responseApiError(response)).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(fixture.updateCalls).toHaveLength(0)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
