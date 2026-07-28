/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CREATE_PROFILE_BODY,
  CTE_PROFILES_PATH,
  IDEMPOTENCY_KEY,
  jsonRequest,
  PROFILE_DETAIL,
  responseApiError,
  serializeProfileDetail,
} from '../fixtures/cte-profiles-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createCteProfilesHttpFixture,
  READ_ONLY_CONTEXT,
} from '../fixtures/cte-profiles-http.fixture'

describe('cte emission profiles http listing and security contract', () => {
  test('lists profiles in the paginated envelope with the default page size', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: CTE_PROFILES_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [serializeProfileDetail(PROFILE_DETAIL)],
      page: { nextCursor: null },
    })
    expect(fixture.listCalls).toEqual([{ context: COMPANY_CONTEXT, cursor: null, limit: 25 }])
  })

  test('forwards the supported filters and rejects unknown query parameters', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const filteredResponse = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${CTE_PROFILES_PATH}?limit=10&nameContains=Spani&statusEq=active`,
      }),
    )

    expect(filteredResponse.status).toBe(200)
    expect(fixture.listCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        filters: { nameContains: 'Spani', statusEq: 'active' },
        limit: 10,
      },
    ])

    const unknownFilterFixture = await createCteProfilesHttpFixture()
    const unknownFilterResponse = await unknownFilterFixture.handle(
      jsonRequest({ method: 'GET', path: `${CTE_PROFILES_PATH}?companyId=other-company` }),
    )

    expect(unknownFilterResponse.status).toBe(400)
    expect((await responseApiError(unknownFilterResponse)).code).toBe('INVALID_REQUEST')
    expect(unknownFilterFixture.listCalls).toEqual([])
  })

  test('denies every profile route without the settings management permission', async () => {
    const fixture = await createCteProfilesHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const listResponse = await fixture.handle(
      jsonRequest({ method: 'GET', path: CTE_PROFILES_PATH }),
    )
    const createResponse = await fixture.handle(
      jsonRequest({
        body: CREATE_PROFILE_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(listResponse.status).toBe(403)
    expect((await responseApiError(listResponse)).code).toBe('FORBIDDEN')
    expect(createResponse.status).toBe(403)
    expect(fixture.listCalls).toEqual([])
    expect(fixture.createCalls).toEqual([])
  })
})
