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
  jsonRequest,
  MATCHERS_BODY,
  PROFILE_ID,
  PROFILE_SETTINGS_BODY,
  responseApiError,
  UPDATE_PROFILE_BODY,
} from '../fixtures/cte-profiles-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createCteProfilesHttpFixture,
} from '../fixtures/cte-profiles-http.fixture'

const PROFILE_PATH = `${CTE_PROFILES_PATH}/${PROFILE_ID}`
const STATUS_PATH = `${PROFILE_PATH}/status`

describe('cte emission profiles http update and status contract', () => {
  test('updates a profile with the expected version taken from the body', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_PROFILE_BODY, method: 'PATCH', path: PROFILE_PATH }),
    )

    expect(response.status).toBe(200)
    expect(
      ((await response.json()) as { readonly data: { readonly version: string } }).data.version,
    ).toBe('2')
    expect(fixture.updateCalls).toEqual([
      {
        components: COMPONENTS_BODY.map((component) => ({ ...component })),
        context: COMPANY_CONTEXT,
        correlationId: 'cte-profiles-http-correlation',
        expectedVersion: '1',
        freightRule: { ...FREIGHT_RULE_BODY },
        matchers: MATCHERS_BODY.map((matcher) => ({ ...matcher })),
        profileId: PROFILE_ID,
        settings: { ...PROFILE_SETTINGS_BODY },
      },
    ])
  })

  test('refuses an update without the expected version and never matches a non-uuid path', async () => {
    const missingVersionFixture = await createCteProfilesHttpFixture()
    const missingVersionResponse = await missingVersionFixture.handle(
      jsonRequest({ body: CREATE_PROFILE_BODY, method: 'PATCH', path: PROFILE_PATH }),
    )

    expect(missingVersionResponse.status).toBe(400)
    expect((await responseApiError(missingVersionResponse)).code).toBe('INVALID_REQUEST')
    expect(missingVersionFixture.updateCalls).toEqual([])

    const invalidPathFixture = await createCteProfilesHttpFixture()
    const invalidPathResponse = await invalidPathFixture.handle(
      jsonRequest({
        body: UPDATE_PROFILE_BODY,
        method: 'PATCH',
        path: `${CTE_PROFILES_PATH}/not-a-uuid`,
      }),
    )

    expect(invalidPathResponse.status).toBe(404)
    expect(invalidPathFixture.updateCalls).toEqual([])
  })

  test('propagates the optimistic locking conflict as 409', async () => {
    const fixture = await createCteProfilesHttpFixture({
      updateError: new ApiError({
        code: 'CTE_PROFILE_VERSION_CONFLICT',
        message: 'Profile version conflict',
        status: 409,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_PROFILE_BODY, method: 'PATCH', path: PROFILE_PATH }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('CTE_PROFILE_VERSION_CONFLICT')
  })

  test('routes the status transition to activate or deactivate', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const activateResponse = await fixture.handle(
      jsonRequest({
        body: { expectedVersion: '1', status: 'active' },
        method: 'PATCH',
        path: STATUS_PATH,
      }),
    )
    const deactivateResponse = await fixture.handle(
      jsonRequest({
        body: { expectedVersion: '2', status: 'inactive' },
        method: 'PATCH',
        path: STATUS_PATH,
      }),
    )

    expect(activateResponse.status).toBe(200)
    expect(deactivateResponse.status).toBe(200)
    expect(fixture.activateCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'cte-profiles-http-correlation',
        expectedVersion: '1',
        profileId: PROFILE_ID,
      },
    ])
    expect(fixture.deactivateCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'cte-profiles-http-correlation',
        expectedVersion: '2',
        profileId: PROFILE_ID,
      },
    ])
  })

  test('rejects a status the transition endpoint does not accept', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { expectedVersion: '1', status: 'draft' },
        method: 'PATCH',
        path: STATUS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.activateCalls).toEqual([])
    expect(fixture.deactivateCalls).toEqual([])
  })
})
