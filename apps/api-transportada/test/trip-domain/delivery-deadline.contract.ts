/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.1, CA1/CA4: a política pura do prazo de entrega, em tabela. Datas civis em texto — o
 * relógio e o fuso são da borda, que tem o contrato próprio (delivery-deadline-input.contract.ts).
 */
import { describe, expect, test } from 'bun:test'

import { resolveDeliveryDeadline } from '../../src/trips/domain/delivery-deadline.policy.js'
import { DEADLINE_CALENDARS } from '../fixtures/delivery-deadline-calendar.fixture.js'
import {
  DUE_ON_CASES,
  FAR_FUTURE_DAY,
  NOT_APPLICABLE_CASES,
  PENDING,
  STATE_CASES,
  deliveredOn,
} from './delivery-deadline.cases.js'

describe('spec 236 — o estado do prazo de entrega, linha a linha', () => {
  for (const row of STATE_CASES) {
    test(`linha ${String(row.line)}: ${row.expected.state} em ${row.today}`, () => {
      const result = resolveDeliveryDeadline({
        arrivedOn: row.arrivedOn,
        calendar: DEADLINE_CALENDARS[row.city],
        deadlineBusinessDays: row.days,
        outcome: row.outcome,
        today: row.today,
      })

      expect(result).toEqual(row.expected)
    })
  }
})

describe('spec 236 — o vencimento é a chegada mais N dias úteis da cidade', () => {
  for (const row of DUE_ON_CASES) {
    test(`linha ${String(row.line)}: ${row.arrivedOn} + ${String(row.days)} → ${row.dueOn}`, () => {
      const result = resolveDeliveryDeadline({
        arrivedOn: row.arrivedOn,
        calendar: DEADLINE_CALENDARS[row.city],
        deadlineBusinessDays: row.days,
        outcome: PENDING,
        today: row.arrivedOn,
      })

      expect(result).toMatchObject({ dueOn: row.dueOn, state: 'on_time' })
    })
  }
})

describe('spec 236 — o que não tem prazo devolve o motivo', () => {
  for (const row of NOT_APPLICABLE_CASES) {
    test(`linha ${String(row.line)}: ${row.reason}`, () => {
      const result = resolveDeliveryDeadline({
        arrivedOn: row.params.arrivedOn,
        calendar: row.params.city === null ? null : DEADLINE_CALENDARS[row.params.city],
        deadlineBusinessDays: row.params.days,
        outcome: row.outcome,
        today: '2026-10-20',
      })

      expect(result).toEqual({ reason: row.reason, state: 'not_applicable' })
    })
  }
})

describe('spec 236 — a precedência do não se aplica', () => {
  const calendar = DEADLINE_CALENDARS.beloHorizonte
  const nothing = {
    arrivedOn: null,
    calendar: null,
    deadlineBusinessDays: null,
    today: '2026-10-20',
  }

  test('o desfecho que encerra a nota vence a falta de chegada, de prazo e de cidade', () => {
    const outcomes = [
      { kind: 'cancelled' },
      { kind: 'returned' },
      { kind: 'returned_to_contractor' },
      { kind: 'released' },
    ] as const

    expect(outcomes.map((outcome) => resolveDeliveryDeadline({ ...nothing, outcome }))).toEqual(
      outcomes.map(({ kind }) => ({ reason: kind, state: 'not_applicable' })),
    )
  })

  test('sem chegada vence sem prazo, que vence sem cidade', () => {
    const base = { calendar, deadlineBusinessDays: 3, outcome: PENDING, today: '2026-10-20' }
    const withoutArrival = resolveDeliveryDeadline({
      ...base,
      arrivedOn: null,
      calendar: null,
      deadlineBusinessDays: null,
    })
    const withoutDeadline = resolveDeliveryDeadline({
      ...base,
      arrivedOn: '2026-10-05',
      calendar: null,
      deadlineBusinessDays: null,
    })

    expect(withoutArrival).toEqual({ reason: 'no_arrival', state: 'not_applicable' })
    expect(withoutDeadline).toEqual({ reason: 'no_deadline', state: 'not_applicable' })
  })

  test('nota entregue sem chegada registrada também não tem prazo', () => {
    const result = resolveDeliveryDeadline({
      ...nothing,
      calendar,
      deadlineBusinessDays: 3,
      outcome: deliveredOn('2026-10-08'),
    })

    expect(result).toEqual({ reason: 'no_arrival', state: 'not_applicable' })
  })
})

describe('spec 236 — nota entregue é terminal e ignora o hoje', () => {
  test('o mesmo vencimento, com o hoje antes, no dia e depois, dá o mesmo resultado', () => {
    const results = ['2026-10-06', '2026-10-08', FAR_FUTURE_DAY].map((today) =>
      resolveDeliveryDeadline({
        arrivedOn: '2026-10-05',
        calendar: DEADLINE_CALENDARS.beloHorizonte,
        deadlineBusinessDays: 3,
        outcome: deliveredOn('2026-10-09'),
        today,
      }),
    )

    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1)
    expect(results[0]).toEqual({
      businessDaysLate: 1,
      deliveredOn: '2026-10-09',
      dueOn: '2026-10-08',
      state: 'delivered_late',
    })
  })
})

describe('spec 236 — a cobertura do calendário não é adivinhada', () => {
  test('uma chegada fora dos anos carregados lança, em vez de ficar sem feriado', () => {
    expect(() =>
      resolveDeliveryDeadline({
        arrivedOn: '2031-01-02',
        calendar: DEADLINE_CALENDARS.beloHorizonte,
        deadlineBusinessDays: 3,
        outcome: PENDING,
        today: '2031-01-02',
      }),
    ).toThrow()
  })
})
