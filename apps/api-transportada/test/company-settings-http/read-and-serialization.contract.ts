/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  EXPECTED_SETTINGS_RESULT,
  OTHER_COMPANY_ID,
} from '../fixtures/company-settings-application.fixture'
import {
  COMPANY_SETTINGS_PATH,
  createCompanySettingsHttpFixture,
  FRONTEND_ORIGIN,
  getSettingsRequest,
} from '../fixtures/company-settings-http.fixture'
import { EXPECTED_HTTP_SETTINGS_DATA } from '../fixtures/company-settings-http-payload.fixture'

describe('GET /company-settings HTTP contract', () => {
  test('returns the authenticated company empty state and ignores tenant selectors', async () => {
    const fixture = await createCompanySettingsHttpFixture({ getResult: null })
    const request = getSettingsRequest({
      origin: FRONTEND_ORIGIN,
      query: `?companyId=${OTHER_COMPANY_ID}`,
    })
    request.headers.set('x-company-id', OTHER_COMPANY_ID)

    const response = await fixture.handle(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        activation: null,
        billing: null,
        cte: null,
        cteRetry: null,
        mdfe: null,
        profile: null,
      },
    })
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.getCalls).toEqual([COMPANY_CONTEXT])
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({ pathname: COMPANY_SETTINGS_PATH, status: 200 }),
    )
  })

  test('serializes bigint fields as decimal strings using an exact safe allowlist', async () => {
    const resultWithUnexpectedRuntimeField = {
      ...EXPECTED_SETTINGS_RESULT,
      profile: {
        ...EXPECTED_SETTINGS_RESULT.profile,
        secretEnvelope: 'must-not-leak',
      },
    }
    const fixture = await createCompanySettingsHttpFixture({
      getResult: resultWithUnexpectedRuntimeField,
    })

    const response = await fixture.handle(getSettingsRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ data: EXPECTED_HTTP_SETTINGS_DATA })
    const serialized = JSON.stringify(body)
    for (const forbidden of [
      'certificateBase64',
      'password',
      'secretEnvelope',
      'requestFingerprint',
      'keyId',
      'issuer',
      'subject',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(new URL(`http://localhost${COMPANY_SETTINGS_PATH}`).pathname).toBe(COMPANY_SETTINGS_PATH)
  })
})
