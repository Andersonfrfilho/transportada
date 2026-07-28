/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CTE_RETRY_BACKOFF_STEPS_LIMIT,
  CTE_RETRY_DEFAULT_BACKOFF_SECONDS,
  CTE_RETRY_DEFAULT_MAX_ATTEMPTS,
  CTE_RETRY_MAX_ATTEMPTS_LIMIT,
  calculateCteRetryNextAttemptAt,
  createCteRetryPolicy,
  isCteRetryExhausted,
  resolveCteRetryDelaySeconds,
} from '../../src/cte-issuance/domain/cte-retry.policy.js'
import { CteRetryPolicyInvalidError } from '../../src/cte-issuance/domain/cte-retry.error.js'

const NOW = new Date('2026-07-27T12:00:00.000Z')

describe('CT-e retry policy', () => {
  test('falls back to the shipped defaults when the company has no configuration', () => {
    const policy = createCteRetryPolicy({})

    expect(policy).toEqual({
      backoffSeconds: [...CTE_RETRY_DEFAULT_BACKOFF_SECONDS],
      maxAttempts: CTE_RETRY_DEFAULT_MAX_ATTEMPTS,
    })
    expect(createCteRetryPolicy({ backoffSeconds: null, maxAttempts: null })).toEqual(policy)
  })

  test('keeps the configured attempts and backoff of the company', () => {
    const policy = createCteRetryPolicy({ backoffSeconds: [15, 60], maxAttempts: 5 })

    expect(policy).toEqual({ backoffSeconds: [15, 60], maxAttempts: 5 })
  })

  test('rejects configurations that would disable or unbound the retry', () => {
    const invalid = [
      { maxAttempts: 0 },
      { maxAttempts: -1 },
      { maxAttempts: 2.5 },
      { maxAttempts: CTE_RETRY_MAX_ATTEMPTS_LIMIT + 1 },
      { backoffSeconds: [] },
      { backoffSeconds: [0] },
      { backoffSeconds: [-5] },
      { backoffSeconds: [1.5] },
      { backoffSeconds: Array.from({ length: CTE_RETRY_BACKOFF_STEPS_LIMIT + 1 }, () => 5) },
    ]

    for (const input of invalid) {
      expect(() => createCteRetryPolicy(input)).toThrowError(CteRetryPolicyInvalidError)
    }
  })

  test('escalates the delay per attempt and repeats the last step when the curve runs out', () => {
    const policy = createCteRetryPolicy({ backoffSeconds: [5, 30, 300], maxAttempts: 6 })

    expect(resolveCteRetryDelaySeconds({ attemptsMade: 1, policy })).toBe(5)
    expect(resolveCteRetryDelaySeconds({ attemptsMade: 2, policy })).toBe(30)
    expect(resolveCteRetryDelaySeconds({ attemptsMade: 3, policy })).toBe(300)
    expect(resolveCteRetryDelaySeconds({ attemptsMade: 5, policy })).toBe(300)
    expect(resolveCteRetryDelaySeconds({ attemptsMade: 0, policy })).toBe(5)
  })

  test('projects the next attempt from the clock instead of a fixed ten seconds', () => {
    const policy = createCteRetryPolicy({ backoffSeconds: [45, 90], maxAttempts: 4 })

    expect(calculateCteRetryNextAttemptAt({ attemptsMade: 1, now: NOW, policy })).toEqual(
      new Date('2026-07-27T12:00:45.000Z'),
    )
    expect(calculateCteRetryNextAttemptAt({ attemptsMade: 2, now: NOW, policy })).toEqual(
      new Date('2026-07-27T12:01:30.000Z'),
    )
  })

  test('exhausts the schedule exactly at the configured number of attempts', () => {
    const policy = createCteRetryPolicy({ backoffSeconds: [5], maxAttempts: 3 })

    expect(isCteRetryExhausted({ attemptsMade: 2, policy })).toBeFalse()
    expect(isCteRetryExhausted({ attemptsMade: 3, policy })).toBeTrue()
    expect(isCteRetryExhausted({ attemptsMade: 4, policy })).toBeTrue()
    expect(
      isCteRetryExhausted({ attemptsMade: 3, policy: createCteRetryPolicy({ maxAttempts: 5 }) }),
    ).toBeFalse()
  })
})
