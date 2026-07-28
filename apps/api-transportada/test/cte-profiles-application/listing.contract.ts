/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPONENTS,
  CONTEXT,
  CORRELATION_ID,
  createCteProfilesFixture,
  FREIGHT_RULE,
  IDEMPOTENCY_KEY,
  MATCHERS,
  PROFILE_ID,
  PROFILE_SETTINGS,
} from '../fixtures/cte-profiles-application.fixture.js'

describe('cte emission profiles listing', () => {
  test('never returns a profile that belongs to another company', async () => {
    const fixture = createCteProfilesFixture({ seedOtherCompanyProfile: true })
    await fixture.useCase.create({
      components: COMPONENTS,
      context: CONTEXT,
      correlationId: CORRELATION_ID,
      freightRule: FREIGHT_RULE,
      idempotencyKey: IDEMPOTENCY_KEY,
      matchers: MATCHERS,
      settings: PROFILE_SETTINGS,
    })

    const page = await fixture.useCase.list({ context: CONTEXT, cursor: null, limit: 25 })

    expect(page.items.map((profile) => profile.id)).toEqual([PROFILE_ID])
    expect(page.nextCursor).toBeNull()
  })

  test('forwards the authenticated company, cursor, limit and status filter to the repository', async () => {
    const fixture = createCteProfilesFixture()

    await fixture.useCase.list({
      context: CONTEXT,
      cursor: '2026-07-27T12:00:00.000Z::00000000-0000-4000-8000-000000000903',
      filters: { statusEq: 'active' },
      limit: 10,
    })

    expect(fixture.listCalls).toEqual([
      {
        companyId: CONTEXT.companyId,
        cursor: '2026-07-27T12:00:00.000Z::00000000-0000-4000-8000-000000000903',
        limit: 10,
        status: 'active',
      },
    ])
  })
})
