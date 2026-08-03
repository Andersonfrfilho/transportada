/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  COMPONENTS_BODY,
  CREATE_PROFILE_BODY,
  CTE_PROFILES_PATH,
  FREIGHT_RULE_BODY,
  IDEMPOTENCY_KEY,
  jsonRequest,
  MATCHERS_BODY,
  PROFILE_DETAIL,
  PROFILE_SETTINGS_BODY,
  responseApiError,
  serializeProfileDetail,
} from '../fixtures/cte-profiles-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createCteProfilesHttpFixture,
} from '../fixtures/cte-profiles-http.fixture'

describe('cte emission profiles http create contract', () => {
  test('creates a profile from the nested settings, rule, matchers and components payload', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: CREATE_PROFILE_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: serializeProfileDetail(PROFILE_DETAIL) })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.createCalls).toEqual([
      {
        components: COMPONENTS_BODY.map((component) => ({ ...component })),
        context: COMPANY_CONTEXT,
        correlationId: 'cte-profiles-http-correlation',
        freightRule: { ...FREIGHT_RULE_BODY },
        idempotencyKey: IDEMPOTENCY_KEY,
        matchers: MATCHERS_BODY.map((matcher) => ({ ...matcher })),
        settings: { ...PROFILE_SETTINGS_BODY },
      },
    ])
  })

  test('requires an idempotency key before reaching the use case', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_PROFILE_BODY, method: 'POST', path: CTE_PROFILES_PATH }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.createCalls).toEqual([])
  })

  test('refuses a company identifier smuggled in the payload', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          ...CREATE_PROFILE_BODY,
          settings: { ...PROFILE_SETTINGS_BODY, companyId: 'forbidden-company' },
        },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.createCalls).toEqual([])
  })

  test('rejects a component whose value does not match its calculation type', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          ...CREATE_PROFILE_BODY,
          components: [
            {
              amount: null,
              calculationType: 'fixed_amount',
              label: 'Pedagio',
              ordinal: '1',
              rate: '0.003000',
              validFrom: '2026-01-01T00:00:00.000Z',
              validUntil: null,
            },
          ],
        },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.createCalls).toEqual([])
  })

  test('demands a product name only when the predominant product is fixed', async () => {
    const missingNameFixture = await createCteProfilesHttpFixture()
    const missingNameResponse = await missingNameFixture.handle(
      jsonRequest({
        body: {
          ...CREATE_PROFILE_BODY,
          settings: { ...PROFILE_SETTINGS_BODY, predominantProductMode: 'fixed' },
        },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(missingNameResponse.status).toBe(400)
    expect(missingNameFixture.createCalls).toEqual([])

    const unusedNameFixture = await createCteProfilesHttpFixture()
    const unusedNameResponse = await unusedNameFixture.handle(
      jsonRequest({
        body: {
          ...CREATE_PROFILE_BODY,
          settings: { ...PROFILE_SETTINGS_BODY, predominantProductName: 'ARROZ' },
        },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(unusedNameResponse.status).toBe(400)
    expect(unusedNameFixture.createCalls).toEqual([])

    const quantityNameFixture = await createCteProfilesHttpFixture()
    const quantityNameResponse = await quantityNameFixture.handle(
      jsonRequest({
        body: {
          ...CREATE_PROFILE_BODY,
          settings: {
            ...PROFILE_SETTINGS_BODY,
            predominantProductMode: 'highest_quantity',
            predominantProductName: 'ARROZ',
          },
        },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(quantityNameResponse.status).toBe(400)
    expect(quantityNameFixture.createCalls).toEqual([])
  })

  test('persists and returns the highest quantity predominant product mode', async () => {
    const settings = { ...PROFILE_SETTINGS_BODY, predominantProductMode: 'highest_quantity' }
    const fixture = await createCteProfilesHttpFixture({
      createResult: { ...PROFILE_DETAIL, predominantProductMode: 'highest_quantity' },
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_PROFILE_BODY, settings },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createCalls[0]?.settings).toEqual(
      expect.objectContaining({ predominantProductMode: 'highest_quantity' }),
    )
    expect(await response.json()).toEqual({
      data: serializeProfileDetail({
        ...PROFILE_DETAIL,
        predominantProductMode: 'highest_quantity',
      }),
    })
  })

  test('accepts pickup details only when the profile indicates pickup at the destination', async () => {
    const rejectedFixture = await createCteProfilesHttpFixture()
    const rejectedResponse = await rejectedFixture.handle(
      jsonRequest({
        body: {
          ...CREATE_PROFILE_BODY,
          settings: { ...PROFILE_SETTINGS_BODY, pickupDetails: 'Retirar na doca 3' },
        },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(rejectedResponse.status).toBe(400)
    expect((await responseApiError(rejectedResponse)).code).toBe('INVALID_REQUEST')
    expect(rejectedFixture.createCalls).toEqual([])

    const acceptedFixture = await createCteProfilesHttpFixture()
    const acceptedResponse = await acceptedFixture.handle(
      jsonRequest({
        body: {
          ...CREATE_PROFILE_BODY,
          settings: {
            ...PROFILE_SETTINGS_BODY,
            pickupDetails: 'Retirar na doca 3',
            pickupIndicator: '0',
          },
        },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(acceptedResponse.status).toBe(201)
    expect(acceptedFixture.createCalls[0]?.settings).toEqual(
      expect.objectContaining({ pickupDetails: 'Retirar na doca 3', pickupIndicator: '0' }),
    )
  })

  test('surfaces an idempotency key reused with a different payload as a conflict', async () => {
    const fixture = await createCteProfilesHttpFixture({
      createError: new ApiError({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key cannot be reused',
        status: 409,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: CREATE_PROFILE_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('IDEMPOTENCY_KEY_REUSED')
  })
})
