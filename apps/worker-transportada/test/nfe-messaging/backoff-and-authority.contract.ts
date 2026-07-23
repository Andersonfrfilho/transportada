/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  NFE_IMPORT_BACKOFF_ATTEMPTS_MS,
  calculateNfePersistentBackoff,
} from '../../src/messaging/nfe-backoff-policy.js'
import {
  NfeMessageAuthorityMismatchError,
  validateNfeMessageAuthority,
} from '../../src/messaging/nfe-message-authority.service.js'

const envelope = {
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  type: 'transportada.nfe.import.requested' as const,
  version: 1 as const,
  occurredAt: '2026-07-22T20:00:00.000Z',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  correlationId: 'contract-test-correlation',
  payload: {
    importId: '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c',
  },
}

const authoritativeRecord = {
  eventId: envelope.eventId,
  companyId: envelope.companyId,
  actorId: envelope.actorId,
  aggregateId: envelope.payload.importId,
}

describe('NF-e persistent backoff and authority contract', () => {
  it('defines gradual backoff for persisted next_attempt_at scheduling', () => {
    const now = new Date('2026-07-22T20:00:00.000Z')

    expect(NFE_IMPORT_BACKOFF_ATTEMPTS_MS).toEqual([5_000, 30_000, 300_000])
    expect(calculateNfePersistentBackoff({ attempt: 0, now })).toEqual({
      attempt: 1,
      nextAttemptAt: new Date('2026-07-22T20:00:05.000Z'),
    })
    expect(calculateNfePersistentBackoff({ attempt: 1, now })).toEqual({
      attempt: 2,
      nextAttemptAt: new Date('2026-07-22T20:00:30.000Z'),
    })
    expect(calculateNfePersistentBackoff({ attempt: 2, now })).toEqual({
      attempt: 3,
      nextAttemptAt: new Date('2026-07-22T20:05:00.000Z'),
    })
    expect(calculateNfePersistentBackoff({ attempt: 9, now })).toEqual({
      attempt: 10,
      nextAttemptAt: new Date('2026-07-22T20:05:00.000Z'),
    })
  })

  it('accepts a message only when persisted outbox/import authority matches every claim', () => {
    expect(validateNfeMessageAuthority({ envelope, authoritativeRecord })).toEqual({
      accepted: true,
    })
  })

  it.each([
    ['event', { ...authoritativeRecord, eventId: crypto.randomUUID() }],
    ['tenant', { ...authoritativeRecord, companyId: crypto.randomUUID() }],
    ['actor', { ...authoritativeRecord, actorId: crypto.randomUUID() }],
    ['aggregate', { ...authoritativeRecord, aggregateId: crypto.randomUUID() }],
  ])('rejects divergent %s claims as fatal before selecting tenant data', (_caseName, record) => {
    expect(() => validateNfeMessageAuthority({ envelope, authoritativeRecord: record })).toThrow(
      NfeMessageAuthorityMismatchError,
    )
  })
})
