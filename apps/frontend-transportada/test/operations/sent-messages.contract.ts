/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  failureRate,
  sentMessagesFromApi,
  sentMessagesWindow,
} from '../../src/modules/operations/shared/sentMessages.service'

const BODY = {
  data: {
    byCategory: [{ category: 'occurrence', failed: 1, sent: 3, total: 4 }],
    byChannel: [{ channel: 'whatsapp', failed: 1, sent: 3, total: 4 }],
    bySubcategory: [
      {
        audience: 'client',
        category: 'occurrence',
        channel: 'whatsapp',
        failed: 1,
        sent: 3,
        subcategory: 'sem_tipo',
        total: 4,
      },
    ],
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-11-02T00:00:00.000Z',
    total: { failed: 1, sent: 3, total: 4 },
    unavailable: ['access'],
  },
}

describe('sent messages (spec 290)', () => {
  test('reads the API body and drops malformed rows', () => {
    const parsed = sentMessagesFromApi({
      data: { ...BODY.data, byChannel: [...BODY.data.byChannel, { channel: 7 }] },
    })
    expect(parsed.total.total).toBe(4)
    expect(parsed.byChannel).toHaveLength(1)
    expect(parsed.bySubcategory[0]?.audience).toBe('client')
    expect(parsed.unavailable).toEqual(['access'])
  })

  test('rejects a body without totals', () => {
    expect(() => sentMessagesFromApi({ data: {} })).toThrow('SENT_MESSAGES_RESPONSE_INVALID')
  })

  test('window spans the chosen period ending now', () => {
    const now = new Date('2026-11-08T00:00:00.000Z')
    expect(sentMessagesWindow('week', now)).toEqual({
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-08T00:00:00.000Z',
    })
  })

  test('failure rate is null without sends and rounded otherwise', () => {
    expect(failureRate({ failed: 0, sent: 0, total: 0 })).toBeNull()
    expect(failureRate({ failed: 1, sent: 2, total: 3 })).toBe(33)
  })
})
