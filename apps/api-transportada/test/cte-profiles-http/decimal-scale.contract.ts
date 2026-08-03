/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPONENTS_BODY,
  CREATE_PROFILE_BODY,
  CTE_PROFILES_PATH,
  FREIGHT_RULE_BODY,
  IDEMPOTENCY_KEY,
  jsonRequest,
  PROFILE_SETTINGS_BODY,
  responseApiError,
} from '../fixtures/cte-profiles-http-payload.fixture'
import { createCteProfilesHttpFixture } from '../fixtures/cte-profiles-http.fixture'

async function postProfile(body: object): Promise<{
  readonly createCalls: readonly unknown[]
  readonly response: Response
}> {
  const fixture = await createCteProfilesHttpFixture()
  const response = await fixture.handle(
    jsonRequest({
      body,
      idempotencyKey: IDEMPOTENCY_KEY,
      method: 'POST',
      path: CTE_PROFILES_PATH,
    }),
  )
  return { createCalls: fixture.createCalls, response }
}

async function expectRefused(body: object): Promise<void> {
  const { createCalls, response } = await postProfile(body)

  expect(response.status).toBe(400)
  expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
  expect(createCalls).toEqual([])
}

describe('cte emission profiles http decimal scale contract', () => {
  test('refuses an icms rate written without the contract scale', async () => {
    await expectRefused({
      ...CREATE_PROFILE_BODY,
      settings: { ...PROFILE_SETTINGS_BODY, icmsRate: '0' },
    })
  })

  test('refuses a whole icms base reduction rate written without decimals', async () => {
    await expectRefused({
      ...CREATE_PROFILE_BODY,
      settings: { ...PROFILE_SETTINGS_BODY, icmsBaseReductionRate: '1' },
    })
  })

  test('refuses a freight rule percentage written without the contract scale', async () => {
    await expectRefused({
      ...CREATE_PROFILE_BODY,
      freightRule: { ...FREIGHT_RULE_BODY, percentage: '0' },
    })
  })

  test('refuses a component rate written without the contract scale', async () => {
    await expectRefused({
      ...CREATE_PROFILE_BODY,
      components: [{ ...COMPONENTS_BODY[0], rate: '1' }],
    })
  })

  test('refuses freight rule money written without the contract scale', async () => {
    await expectRefused({
      ...CREATE_PROFILE_BODY,
      freightRule: { ...FREIGHT_RULE_BODY, minimumAmount: '900' },
    })
  })

  test('accepts every rate and money value written with the contract scale', async () => {
    const { createCalls, response } = await postProfile({
      ...CREATE_PROFILE_BODY,
      freightRule: {
        ...FREIGHT_RULE_BODY,
        maximumAmount: '1200.0000',
        minimumAmount: '900.0000',
        percentage: '1.000000',
      },
      settings: {
        ...PROFILE_SETTINGS_BODY,
        icmsBaseReductionRate: '0.000000',
        icmsRate: '0.120000',
      },
    })

    expect(response.status).toBe(201)
    expect(createCalls).toHaveLength(1)
  })
})
