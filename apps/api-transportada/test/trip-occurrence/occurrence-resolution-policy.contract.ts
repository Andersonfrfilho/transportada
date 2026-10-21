/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o estado do andamento da ocorrência é o último evento — sem evento está em
 * aberto, e a ocorrência cancelada (167) não volta, tenha o histórico que tiver.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveOccurrenceResolutionState,
  resolveSystemResolutionCausePhraseKey,
  resolveSystemResolutionPhraseKey,
} from '../../src/trips/domain/occurrence-resolution.policy.js'
import type { OccurrenceResolutionEventFact } from '../../src/trips/domain/occurrence-resolution.types.js'

function event(
  overrides: Partial<OccurrenceResolutionEventFact> & { id: string; createdAt: string },
): OccurrenceResolutionEventFact {
  return {
    actorKind: 'internal',
    caseEventStatus: undefined,
    kind: 'resolved',
    note: 'Assunto encerrado com a contratante.',
    sequence: Date.parse(overrides.createdAt),
    ...overrides,
  }
}

describe('occurrence resolution state', () => {
  test('is open when there is no event', () => {
    expect(resolveOccurrenceResolutionState({ cancelledAt: undefined, events: [] })).toEqual({
      lastResolution: null,
      reopenedAt: null,
      resolvedAt: null,
      state: 'open',
    })
  })

  test('is resolved when the last event resolved it', () => {
    const result = resolveOccurrenceResolutionState({
      cancelledAt: undefined,
      events: [event({ createdAt: '2026-10-15T10:00:00.000Z', id: 'a' })],
    })

    expect(result.state).toBe('resolved')
    expect(result.resolvedAt).toBe('2026-10-15T10:00:00.000Z')
    expect(result.reopenedAt).toBeNull()
    expect(result.lastResolution).toEqual({
      actorKind: 'internal',
      at: '2026-10-15T10:00:00.000Z',
      caseEventStatus: undefined,
      note: 'Assunto encerrado com a contratante.',
    })
  })

  test('is open again, with the reopening date, when the last event reopened it', () => {
    const result = resolveOccurrenceResolutionState({
      cancelledAt: undefined,
      events: [
        event({ createdAt: '2026-10-15T10:00:00.000Z', id: 'a' }),
        event({
          actorKind: 'driver',
          createdAt: '2026-10-15T11:00:00.000Z',
          id: 'b',
          kind: 'reopened',
          note: undefined,
        }),
      ],
    })

    expect(result.state).toBe('open')
    expect(result.reopenedAt).toBe('2026-10-15T11:00:00.000Z')
    expect(result.resolvedAt).toBeNull()
    expect(result.lastResolution?.at).toBe('2026-10-15T10:00:00.000Z')
  })

  test('orders by creation date regardless of input order', () => {
    const result = resolveOccurrenceResolutionState({
      cancelledAt: undefined,
      events: [
        event({
          actorKind: 'driver',
          createdAt: '2026-10-15T11:00:00.000Z',
          id: 'b',
          kind: 'reopened',
        }),
        event({ createdAt: '2026-10-15T10:00:00.000Z', id: 'a' }),
      ],
    })

    expect(result.state).toBe('open')
  })

  test('orders by the commit sequence even when the creation date is inverted', () => {
    const reopenedLast = resolveOccurrenceResolutionState({
      cancelledAt: undefined,
      events: [
        event({
          actorKind: 'driver',
          createdAt: '2026-10-15T09:00:00.000Z',
          id: 'a',
          kind: 'reopened',
          sequence: 2,
        }),
        event({ createdAt: '2026-10-15T10:00:00.000Z', id: 'b', sequence: 1 }),
      ],
    })
    const resolvedLast = resolveOccurrenceResolutionState({
      cancelledAt: undefined,
      events: [
        event({ createdAt: '2026-10-15T09:00:00.000Z', id: 'a', sequence: 2 }),
        event({
          actorKind: 'driver',
          createdAt: '2026-10-15T10:00:00.000Z',
          id: 'b',
          kind: 'reopened',
          sequence: 1,
        }),
      ],
    })

    expect(reopenedLast.state).toBe('open')
    expect(resolvedLast.state).toBe('resolved')
  })

  test('is cancelled when cancelled, with or without events', () => {
    const cancelledAt = '2026-10-15T12:00:00.000Z'
    const withEvents = resolveOccurrenceResolutionState({
      cancelledAt,
      events: [event({ createdAt: '2026-10-15T10:00:00.000Z', id: 'a' })],
    })

    expect(withEvents.state).toBe('cancelled')
    expect(resolveOccurrenceResolutionState({ cancelledAt, events: [] }).state).toBe('cancelled')
  })

  test('does not mutate the events it receives', () => {
    const events = [
      event({ createdAt: '2026-10-15T11:00:00.000Z', id: 'b' }),
      event({ createdAt: '2026-10-15T10:00:00.000Z', id: 'a' }),
    ]

    resolveOccurrenceResolutionState({ cancelledAt: undefined, events })

    expect(events.map((fact) => fact.id)).toEqual(['b', 'a'])
  })
})

describe('system resolution phrase key', () => {
  test('maps each terminal case status to a fixed key', () => {
    expect(resolveSystemResolutionPhraseKey('closed')).toBe('case_closed')
    expect(resolveSystemResolutionPhraseKey('returned_to_warehouse')).toBe(
      'case_returned_to_warehouse',
    )
    expect(resolveSystemResolutionPhraseKey('cancelled')).toBe('case_cancelled')
  })

  test('has no key for a status that is not terminal', () => {
    expect(resolveSystemResolutionPhraseKey('decided')).toBeUndefined()
    expect(resolveSystemResolutionPhraseKey('under_review')).toBeUndefined()
  })
})

describe('system resolution caused by the contractor reply (spec 276 T3b)', () => {
  test('the delivered reply has its own key; otherwise the case status decides', () => {
    expect(
      resolveSystemResolutionCausePhraseKey({
        caseEventStatus: undefined,
        causedByContractorReply: true,
      }),
    ).toBe('contractor_reply_delivered')
    expect(resolveSystemResolutionCausePhraseKey({ caseEventStatus: 'closed' })).toBe('case_closed')
    expect(resolveSystemResolutionCausePhraseKey({ caseEventStatus: undefined })).toBeUndefined()
  })

  test('the last resolution carries the cause', () => {
    const state = resolveOccurrenceResolutionState({
      cancelledAt: undefined,
      events: [
        event({
          actorKind: 'system',
          causedByContractorReply: true,
          createdAt: '2026-10-20T10:00:00.000Z',
          id: 'a',
          note: undefined,
        }),
      ],
    })
    expect(state.state).toBe('resolved')
    expect(state.lastResolution).toMatchObject({ causedByContractorReply: true })
  })
})
