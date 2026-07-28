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
import { expectApiErrorCode } from './support.js'

const createInput = (
  overrides: {
    readonly idempotencyKey?: string
    readonly name?: string
  } = {},
) => ({
  components: COMPONENTS,
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  freightRule: FREIGHT_RULE,
  idempotencyKey: overrides.idempotencyKey ?? IDEMPOTENCY_KEY,
  matchers: MATCHERS,
  settings: {
    ...PROFILE_SETTINGS,
    ...(overrides.name === undefined ? {} : { name: overrides.name }),
  },
})

describe('cte emission profiles create', () => {
  test('writes the profile, its freight rule and its children inside a single transaction', async () => {
    const fixture = createCteProfilesFixture()

    const created = await fixture.useCase.create(createInput())

    expect(created.id).toBe(PROFILE_ID)
    expect(created.status).toBe('draft')
    expect(created.version).toBe('1')
    expect(created.freightRule).toEqual(FREIGHT_RULE)
    expect(fixture.transactionCount()).toBe(1)
    expect(fixture.freightRuleOf(PROFILE_ID)).toEqual({
      currentVersion: '1',
      status: 'draft',
      versions: ['1'],
    })
    expect(fixture.profileOf(PROFILE_ID).matchers).toEqual(MATCHERS)
    expect(fixture.profileOf(PROFILE_ID).components).toEqual(COMPONENTS)
  })

  test('records an audit entry naming the profile and its freight rule', async () => {
    const fixture = createCteProfilesFixture()

    await fixture.useCase.create(createInput())

    expect(fixture.audits).toEqual([
      {
        action: 'cte-emission-profile.created',
        actorUserId: CONTEXT.userId,
        afterSnapshot: {
          freightRuleId: fixture.profileOf(PROFILE_ID).freightRuleId,
          matchMode: PROFILE_SETTINGS.matchMode,
          percentage: FREIGHT_RULE.percentage,
          profileId: PROFILE_ID,
          status: 'draft',
        },
        beforeSnapshot: null,
        companyId: CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        entityId: PROFILE_ID,
        entityType: 'cte-emission-profile',
      },
    ])
  })

  test('replays the stored response when the same idempotency key repeats', async () => {
    const fixture = createCteProfilesFixture()

    const first = await fixture.useCase.create(createInput())
    const replay = await fixture.useCase.create(createInput())

    expect(replay).toEqual(first)
    expect(fixture.audits).toHaveLength(1)
    expect(fixture.transactionCount()).toBe(2)
  })

  test('refuses to reuse an idempotency key with a different payload', async () => {
    const fixture = createCteProfilesFixture()
    await fixture.useCase.create(createInput())

    await expectApiErrorCode(
      () => fixture.useCase.create(createInput({ name: 'Spani renomeado' })),
      'IDEMPOTENCY_KEY_REUSED',
    )
  })

  test('surfaces the duplicated profile name as a conflict instead of a database failure', async () => {
    const fixture = createCteProfilesFixture()
    await fixture.useCase.create(createInput())

    await expectApiErrorCode(
      () => fixture.useCase.create(createInput({ idempotencyKey: 'cte-profile-create-key-0002' })),
      'CTE_PROFILE_NAME_TAKEN',
    )
  })
})
