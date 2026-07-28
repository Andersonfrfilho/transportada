/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPONENTS,
  CONTEXT,
  CORRELATION_ID,
  createCteProfilesFixture,
  type CteProfilesFixture,
  FREIGHT_RULE,
  IDEMPOTENCY_KEY,
  MATCHERS,
  PROFILE_ID,
  PROFILE_SETTINGS,
} from '../fixtures/cte-profiles-application.fixture.js'
import { expectApiErrorCode } from './support.js'

const UNKNOWN_PROFILE_ID = '00000000-0000-4000-8000-0000009f0000'

async function seedProfile(
  overrides: { readonly matchMode?: 'sender_tax_id' | 'manual' } = {},
): Promise<CteProfilesFixture> {
  const fixture = createCteProfilesFixture()
  await fixture.useCase.create({
    components: COMPONENTS,
    context: CONTEXT,
    correlationId: CORRELATION_ID,
    freightRule: FREIGHT_RULE,
    idempotencyKey: IDEMPOTENCY_KEY,
    matchers: overrides.matchMode === 'manual' ? [] : MATCHERS,
    settings: {
      ...PROFILE_SETTINGS,
      ...(overrides.matchMode === undefined ? {} : { matchMode: overrides.matchMode }),
    },
  })
  return fixture
}

const updateInput = (
  fixture: CteProfilesFixture,
  overrides: {
    readonly expectedVersion?: string
    readonly percentage?: string
    readonly observations?: string
  } = {},
) => ({
  components: COMPONENTS,
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  expectedVersion: overrides.expectedVersion ?? fixture.profileOf(PROFILE_ID).version,
  freightRule: {
    ...FREIGHT_RULE,
    ...(overrides.percentage === undefined ? {} : { percentage: overrides.percentage }),
  },
  matchers: MATCHERS,
  profileId: PROFILE_ID,
  settings: {
    ...PROFILE_SETTINGS,
    ...(overrides.observations === undefined ? {} : { observations: overrides.observations }),
  },
})

describe('cte emission profiles update and status', () => {
  test('bumps the profile version and opens a freight rule version when the rate changes', async () => {
    const fixture = await seedProfile()

    const updated = await fixture.useCase.update(updateInput(fixture, { percentage: '0.050000' }))

    expect(updated.version).toBe('2')
    expect(updated.freightRule.percentage).toBe('0.050000')
    expect(fixture.freightRuleOf(PROFILE_ID)).toEqual({
      currentVersion: '2',
      status: 'draft',
      versions: ['1', '2'],
    })
  })

  test('leaves the freight rule untouched when only descriptive fields change', async () => {
    const fixture = await seedProfile()

    const updated = await fixture.useCase.update(
      updateInput(fixture, { observations: 'Sem seguro' }),
    )

    expect(updated.version).toBe('2')
    expect(updated.observations).toBe('Sem seguro')
    expect(fixture.freightRuleOf(PROFILE_ID)).toEqual({
      currentVersion: '1',
      status: 'draft',
      versions: ['1'],
    })
  })

  test('rejects a stale expected version instead of overwriting a concurrent edit', async () => {
    const fixture = await seedProfile()
    await fixture.useCase.update(updateInput(fixture, { observations: 'Primeira edicao' }))

    await expectApiErrorCode(
      () => fixture.useCase.update(updateInput(fixture, { expectedVersion: '1' })),
      'CTE_PROFILE_VERSION_CONFLICT',
    )
    expect(fixture.profileOf(PROFILE_ID).observations).toBe('Primeira edicao')
  })

  test('activates the profile and its freight rule in the same transaction', async () => {
    const fixture = await seedProfile()

    const activated = await fixture.useCase.activate({
      context: CONTEXT,
      correlationId: CORRELATION_ID,
      expectedVersion: '1',
      profileId: PROFILE_ID,
    })

    expect(activated.status).toBe('active')
    expect(activated.version).toBe('2')
    expect(fixture.freightRuleOf(PROFILE_ID).status).toBe('active')
    expect(fixture.audits.at(-1)?.action).toBe('cte-emission-profile.activated')
  })

  test('refuses to activate an automatic profile that has no matcher to resolve it', async () => {
    const fixture = await seedProfile({ matchMode: 'sender_tax_id' })
    await fixture.useCase.update({ ...updateInput(fixture), matchers: [] })

    await expectApiErrorCode(
      () =>
        fixture.useCase.activate({
          context: CONTEXT,
          correlationId: CORRELATION_ID,
          expectedVersion: fixture.profileOf(PROFILE_ID).version,
          profileId: PROFILE_ID,
        }),
      'CTE_PROFILE_NOT_ACTIVATABLE',
    )
    expect(fixture.profileOf(PROFILE_ID).status).toBe('draft')
    expect(fixture.freightRuleOf(PROFILE_ID).status).toBe('draft')
  })

  test('deactivates the profile and its freight rule together', async () => {
    const fixture = await seedProfile()
    await fixture.useCase.activate({
      context: CONTEXT,
      correlationId: CORRELATION_ID,
      expectedVersion: '1',
      profileId: PROFILE_ID,
    })

    const deactivated = await fixture.useCase.deactivate({
      context: CONTEXT,
      correlationId: CORRELATION_ID,
      expectedVersion: '2',
      profileId: PROFILE_ID,
    })

    expect(deactivated.status).toBe('inactive')
    expect(fixture.freightRuleOf(PROFILE_ID).status).toBe('inactive')
  })

  test('answers not found for a profile outside the authenticated company', async () => {
    const fixture = await seedProfile()

    await expectApiErrorCode(
      () => fixture.useCase.update({ ...updateInput(fixture), profileId: UNKNOWN_PROFILE_ID }),
      'CTE_PROFILE_NOT_FOUND',
    )
  })
})
