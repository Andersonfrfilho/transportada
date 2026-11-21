/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isOccurrenceBulkResolvable,
  runOccurrenceBulkResolution,
} from '@/modules/trip/shared/occurrenceBulkResolution.service'
import type { TripOccurrenceFeedItem } from '@/modules/trip/shared/tripOccurrenceFeed.service'

function item(resolution: unknown): TripOccurrenceFeedItem {
  return { id: 'x', resolution, source: 'stop' } as unknown as TripOccurrenceFeedItem
}

describe('resolução em massa de ocorrências', () => {
  test('só em aberto e reaberta se resolvem', () => {
    expect(isOccurrenceBulkResolvable(item(null))).toBe(true)
    expect(isOccurrenceBulkResolvable(item(undefined))).toBe(true)
    expect(isOccurrenceBulkResolvable(item({ state: 'reopened' }))).toBe(true)
    expect(isOccurrenceBulkResolvable(item({ state: 'resolved' }))).toBe(false)
    expect(isOccurrenceBulkResolvable(item({ state: 'cancelled' }))).toBe(false)
  })

  test('uma observação para todas; 409 conta como pronta e falha não derruba as demais', async () => {
    const calls: string[] = []
    const outcome = await runOccurrenceBulkResolution({
      items: [
        { id: 'a', source: 'stop' },
        { id: 'b', source: 'document' },
        { id: 'c', source: 'document' },
        { id: 'd', source: 'stop' },
      ],
      note: 'ok',
      resolveOne: (input) => {
        calls.push(`${input.kind}:${input.occurrenceId}:${input.note}`)
        if (input.occurrenceId === 'b')
          return Promise.reject(new Error('OCCURRENCE_ALREADY_RESOLVED'))
        if (input.occurrenceId === 'c') return Promise.reject(new Error('OCCURRENCE_CANCELLED'))
        return Promise.resolve({})
      },
    })
    expect(outcome).toEqual({ alreadyResolved: 1, failed: 1, resolved: 2 })
    expect(calls).toEqual(['stop:a:ok', 'document:b:ok', 'document:c:ok', 'stop:d:ok'])
  })
})
