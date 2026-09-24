/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { REDELIVERY_POLICIES } from '../../src/database/trip.schema.js'
import {
  CONTRACTOR_VISIBLE_CASE_STATUSES,
  resolveOccurrenceCaseOpening,
} from '../../src/trips/domain/occurrence-case.policy.js'

describe('abertura e visibilidade da tratativa (spec 164 T2, D1/D5)', () => {
  test('`unset` nunca abre tratativa; `allowed`/`blocked` abrem em `recorded`', () => {
    expect(REDELIVERY_POLICIES.map((policy) => resolveOccurrenceCaseOpening(policy))).toEqual([
      { opens: false },
      { opens: true, status: 'recorded' },
      { opens: true, status: 'recorded' },
    ])
  })

  test('o portal só alcança `awaiting_contractor`, `decided` e `closed`', () => {
    const sorted: readonly string[] = [...CONTRACTOR_VISIBLE_CASE_STATUSES].sort()
    expect(sorted).toEqual(['awaiting_contractor', 'closed', 'decided'])
  })

  test('`recorded`, `under_review`, `returned_to_warehouse` e `cancelled` ficam de fora', () => {
    for (const hidden of [
      'recorded',
      'under_review',
      'returned_to_warehouse',
      'cancelled',
    ] as const) {
      expect((CONTRACTOR_VISIBLE_CASE_STATUSES as readonly string[]).includes(hidden)).toBe(false)
    }
  })
})
