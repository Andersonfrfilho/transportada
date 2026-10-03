/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  isValidRetentionDays,
  resolvePurgeEffectiveAt,
  type LocationRetentionChoice,
  type ResolvePurgeEffectiveAtParams,
} from '../../src/companies/domain/location-retention.policy.js'

const NOW = new Date('2026-10-03T12:00:00.000Z')
const NOW_PLUS_24H = new Date('2026-10-04T12:00:00.000Z')
const PREVIOUS_EFFECTIVE_AT = new Date('2026-10-01T08:00:00.000Z')
const PENDING_EFFECTIVE_AT = new Date('2026-10-04T06:00:00.000Z')

function choice(purgeEnabled: boolean, retentionDays: number): LocationRetentionChoice {
  return { purgeEnabled, retentionDays }
}

function previous(
  purgeEnabled: boolean,
  retentionDays: number,
  purgeEffectiveAt: Date = PREVIOUS_EFFECTIVE_AT,
): ResolvePurgeEffectiveAtParams['previous'] {
  return { purgeEffectiveAt, purgeEnabled, retentionDays }
}

type EffectiveAtCase = readonly [
  label: string,
  previous: ResolvePurgeEffectiveAtParams['previous'],
  next: LocationRetentionChoice,
  expected: Date,
]

const EFFECTIVE_AT_CASES: readonly EffectiveAtCase[] = [
  ['turning on without a stored row opens the 24 h grace', null, choice(true, 90), NOW_PLUS_24H],
  [
    'turning on from a disabled row opens the 24 h grace',
    previous(false, 90),
    choice(true, 90),
    NOW_PLUS_24H,
  ],
  [
    'turning on from a disabled row with a longer period opens the 24 h grace',
    previous(false, 30),
    choice(true, 90),
    NOW_PLUS_24H,
  ],
  [
    'shortening the period while enabled opens the 24 h grace',
    previous(true, 90),
    choice(true, 30),
    NOW_PLUS_24H,
  ],
  [
    'shortening by a single day while enabled opens the 24 h grace',
    previous(true, 60),
    choice(true, 59),
    NOW_PLUS_24H,
  ],
  [
    'shortening during a running grace restarts the 24 h grace',
    previous(true, 90, PENDING_EFFECTIVE_AT),
    choice(true, 45),
    NOW_PLUS_24H,
  ],
  [
    'lengthening the period while enabled opens no new grace',
    previous(true, 30),
    choice(true, 90),
    PREVIOUS_EFFECTIVE_AT,
  ],
  [
    'lengthening during a running grace keeps the running grace',
    previous(true, 30, PENDING_EFFECTIVE_AT),
    choice(true, 90),
    PENDING_EFFECTIVE_AT,
  ],
  [
    'repeating the same value while enabled opens no new grace',
    previous(true, 60),
    choice(true, 60),
    PREVIOUS_EFFECTIVE_AT,
  ],
  [
    'repeating the same value during a running grace keeps the running grace',
    previous(true, 60, PENDING_EFFECTIVE_AT),
    choice(true, 60),
    PENDING_EFFECTIVE_AT,
  ],
  [
    'turning off from enabled writes now, with no grace',
    previous(true, 90, PENDING_EFFECTIVE_AT),
    choice(false, 90),
    NOW,
  ],
  [
    'turning off while shortening writes now, with no grace',
    previous(true, 90),
    choice(false, 30),
    NOW,
  ],
  ['turning off an already disabled row writes now', previous(false, 90), choice(false, 90), NOW],
  ['saving disabled without a stored row writes now', null, choice(false, 90), NOW],
]

describe('location retention policy contract (spec 239 D5)', () => {
  test('the case table is not empty', () => {
    expect(EFFECTIVE_AT_CASES).toHaveLength(14)
  })

  test.each(EFFECTIVE_AT_CASES)('%s', (_label, previousRow, next, expected) => {
    const result = resolvePurgeEffectiveAt({ next, now: NOW, previous: previousRow })

    expect(result.toISOString()).toBe(expected.toISOString())
  })

  test('reads only the injected clock, so a different now moves the grace', () => {
    const later = new Date('2027-01-15T00:00:00.000Z')

    const result = resolvePurgeEffectiveAt({ next: choice(true, 90), now: later, previous: null })

    expect(result.toISOString()).toBe('2027-01-16T00:00:00.000Z')
  })
})

type RetentionDaysCase = readonly [label: string, value: unknown, expected: boolean]

const RETENTION_DAYS_CASES: readonly RetentionDaysCase[] = [
  ['29 is below the floor', 29, false],
  ['30 is the floor', 30, true],
  ['31 is inside', 31, true],
  ['60 is inside', 60, true],
  ['89 is inside', 89, true],
  ['90 is the ceiling', 90, true],
  ['91 is above the ceiling', 91, false],
  ['0 is refused', 0, false],
  ['a negative number is refused', -30, false],
  ['a decimal is refused', 60.5, false],
  ['a decimal at the floor is refused', 30.1, false],
  ['a numeric string is refused', '60', false],
  ['NaN is refused', Number.NaN, false],
  ['Infinity is refused', Number.POSITIVE_INFINITY, false],
  ['undefined is refused', undefined, false],
  ['null is refused', null, false],
]

describe('location retention days contract (spec 239 D6)', () => {
  test('the case table is not empty', () => {
    expect(RETENTION_DAYS_CASES).toHaveLength(16)
  })

  test.each(RETENTION_DAYS_CASES)('%s', (_label, value, expected) => {
    expect(isValidRetentionDays(value)).toBe(expected)
  })
})
