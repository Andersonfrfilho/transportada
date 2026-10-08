/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.1, CA4: a borda onde o instante vira data civil de São Paulo. As linhas 1 a 11 da tabela
 * passam por aqui, com instantes de verdade: são elas que derrubam a data em UTC e a soma de 24 h.
 */
import { describe, expect, test } from 'bun:test'

import { resolveDeliveryDeadlineFromInstants } from '../../src/trips/application/delivery-deadline-input.service.js'
import type { DeliveryInstantOutcome } from '../../src/trips/application/delivery-deadline-input.service.js'
import type { ResolveDeliveryDeadlineResult } from '../../src/trips/domain/delivery-deadline.types.js'
import { DEADLINE_CALENDARS } from '../fixtures/delivery-deadline-calendar.fixture.js'

const MONDAY_MORNING = '2026-10-05T13:00:00.000Z'
const FAR_FUTURE = '2026-12-31T15:00:00.000Z'
const PENDING_OUTCOME: DeliveryInstantOutcome = { kind: 'pending' }

type InstantCase = {
  readonly arrivedAt: string
  readonly expected: ResolveDeliveryDeadlineResult
  readonly line: number
  readonly now: string
  readonly outcome: DeliveryInstantOutcome
}

function delivered(deliveredAt: string): DeliveryInstantOutcome {
  return { deliveredAt: new Date(deliveredAt), kind: 'delivered' }
}

const DUE_ON_THURSDAY = '2026-10-08'

const INSTANT_CASES: readonly InstantCase[] = [
  {
    arrivedAt: MONDAY_MORNING,
    expected: { businessDaysRemaining: 2, dueOn: DUE_ON_THURSDAY, state: 'on_time' },
    line: 1,
    now: '2026-10-06T15:00:00.000Z',
    outcome: PENDING_OUTCOME,
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: { dueOn: DUE_ON_THURSDAY, state: 'due_today' },
    line: 2,
    now: '2026-10-08T20:00:00.000Z',
    outcome: PENDING_OUTCOME,
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: { businessDaysLate: 1, dueOn: DUE_ON_THURSDAY, state: 'overdue' },
    line: 3,
    now: '2026-10-09T15:00:00.000Z',
    outcome: PENDING_OUTCOME,
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: { businessDaysLate: 1, dueOn: DUE_ON_THURSDAY, state: 'overdue' },
    line: 4,
    now: '2026-10-10T15:00:00.000Z',
    outcome: PENDING_OUTCOME,
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: { businessDaysLate: 2, dueOn: DUE_ON_THURSDAY, state: 'overdue' },
    line: 5,
    now: '2026-10-13T15:00:00.000Z',
    outcome: PENDING_OUTCOME,
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: { deliveredOn: DUE_ON_THURSDAY, dueOn: DUE_ON_THURSDAY, state: 'delivered_on_time' },
    line: 6,
    now: FAR_FUTURE,
    outcome: delivered('2026-10-08T21:00:00.000Z'),
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: { deliveredOn: '2026-10-07', dueOn: DUE_ON_THURSDAY, state: 'delivered_on_time' },
    line: 7,
    now: FAR_FUTURE,
    outcome: delivered('2026-10-07T15:00:00.000Z'),
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: {
      businessDaysLate: 1,
      deliveredOn: '2026-10-09',
      dueOn: DUE_ON_THURSDAY,
      state: 'delivered_late',
    },
    line: 8,
    now: FAR_FUTURE,
    outcome: delivered('2026-10-09T15:00:00.000Z'),
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: {
      businessDaysLate: 1,
      deliveredOn: '2026-10-12',
      dueOn: DUE_ON_THURSDAY,
      state: 'delivered_late',
    },
    line: 9,
    now: FAR_FUTURE,
    outcome: delivered('2026-10-12T15:00:00.000Z'),
  },
  {
    arrivedAt: MONDAY_MORNING,
    expected: { deliveredOn: DUE_ON_THURSDAY, dueOn: DUE_ON_THURSDAY, state: 'delivered_on_time' },
    line: 10,
    now: FAR_FUTURE,
    outcome: delivered('2026-10-09T02:30:00.000Z'),
  },
  {
    arrivedAt: '2026-10-06T02:30:00.000Z',
    expected: { businessDaysRemaining: 2, dueOn: DUE_ON_THURSDAY, state: 'on_time' },
    line: 11,
    now: '2026-10-06T15:00:00.000Z',
    outcome: PENDING_OUTCOME,
  },
]

describe('spec 236 — o instante de São Paulo vira a data civil certa', () => {
  for (const row of INSTANT_CASES) {
    test(`linha ${String(row.line)}: ${row.expected.state}`, () => {
      const result = resolveDeliveryDeadlineFromInstants({
        arrivedAt: new Date(row.arrivedAt),
        calendar: DEADLINE_CALENDARS.beloHorizonte,
        deadlineBusinessDays: 3,
        now: new Date(row.now),
        outcome: row.outcome,
      })

      expect(result).toEqual(row.expected)
    })
  }

  test('23:30 de quinta em São Paulo ainda é quinta: vence hoje, não vencida', () => {
    const result = resolveDeliveryDeadlineFromInstants({
      arrivedAt: new Date(MONDAY_MORNING),
      calendar: DEADLINE_CALENDARS.beloHorizonte,
      deadlineBusinessDays: 3,
      now: new Date('2026-10-09T02:30:00.000Z'),
      outcome: PENDING_OUTCOME,
    })

    expect(result).toEqual({ dueOn: DUE_ON_THURSDAY, state: 'due_today' })
  })

  test('sem chegada registrada a borda não inventa data', () => {
    const result = resolveDeliveryDeadlineFromInstants({
      arrivedAt: null,
      calendar: DEADLINE_CALENDARS.beloHorizonte,
      deadlineBusinessDays: 3,
      now: new Date(MONDAY_MORNING),
      outcome: PENDING_OUTCOME,
    })

    expect(result).toEqual({ reason: 'no_arrival', state: 'not_applicable' })
  })

  test('o desfecho que não é entrega passa direto para a política', () => {
    const result = resolveDeliveryDeadlineFromInstants({
      arrivedAt: new Date(MONDAY_MORNING),
      calendar: DEADLINE_CALENDARS.beloHorizonte,
      deadlineBusinessDays: 3,
      now: new Date(FAR_FUTURE),
      outcome: { kind: 'cancelled' },
    })

    expect(result).toEqual({ reason: 'cancelled', state: 'not_applicable' })
  })
})
