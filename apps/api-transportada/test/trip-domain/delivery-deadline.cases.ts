/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.1, CA1: a tabela do prazo de entrega. A numeração é a das 46 linhas validadas na spec
 * (evidence.md § T1.1), conferidas por conta independente antes de existir código. Linhas de entrega
 * levam `today` bem depois do vencimento: a política não pode olhar o relógio de quem já entregou.
 */
import type {
  DeliveryDeadlineNotApplicableReason,
  DeliveryOutcome,
  ResolveDeliveryDeadlineResult,
} from '../../src/trips/domain/delivery-deadline.types.js'
import { DEADLINE_CITY, type DeadlineCity } from '../fixtures/delivery-deadline-calendar.fixture.js'

const { BELO_HORIZONTE, CAMPINAS, CAMPINAS_WITH_SATURDAY, SAO_PAULO } = DEADLINE_CITY

export const FAR_FUTURE_DAY = '2026-12-31'

export const PENDING: DeliveryOutcome = { kind: 'pending' }

export function deliveredOn(deliveredOnDay: string): DeliveryOutcome {
  return { deliveredOn: deliveredOnDay, kind: 'delivered' }
}

export type DeadlineCase = {
  readonly arrivedOn: string
  readonly city: DeadlineCity
  readonly days: number
  readonly expected: ResolveDeliveryDeadlineResult
  readonly line: number
  readonly outcome: DeliveryOutcome
  readonly today: string
}

function onTime(dueOn: string, businessDaysRemaining: number): ResolveDeliveryDeadlineResult {
  return { businessDaysRemaining, dueOn, state: 'on_time' }
}

function dueToday(dueOn: string): ResolveDeliveryDeadlineResult {
  return { dueOn, state: 'due_today' }
}

function overdue(dueOn: string, businessDaysLate: number): ResolveDeliveryDeadlineResult {
  return { businessDaysLate, dueOn, state: 'overdue' }
}

function deliveredOnTime(dueOn: string, deliveredOnDay: string): ResolveDeliveryDeadlineResult {
  return { deliveredOn: deliveredOnDay, dueOn, state: 'delivered_on_time' }
}

function deliveredLate(
  dueOn: string,
  deliveredOnDay: string,
  businessDaysLate: number,
): ResolveDeliveryDeadlineResult {
  return { businessDaysLate, deliveredOn: deliveredOnDay, dueOn, state: 'delivered_late' }
}

const MONDAY = '2026-10-05'

function pendingCase(
  line: number,
  today: string,
  expected: ResolveDeliveryDeadlineResult,
  overrides: Partial<DeadlineCase> = {},
): DeadlineCase {
  return {
    arrivedOn: MONDAY,
    city: BELO_HORIZONTE,
    days: 3,
    expected,
    line,
    outcome: PENDING,
    today,
    ...overrides,
  }
}

function deliveredCase(
  line: number,
  deliveredOnDay: string,
  expected: ResolveDeliveryDeadlineResult,
  overrides: Partial<DeadlineCase> = {},
): DeadlineCase {
  return pendingCase(line, FAR_FUTURE_DAY, expected, {
    outcome: deliveredOn(deliveredOnDay),
    ...overrides,
  })
}

export const STATE_CASES: readonly DeadlineCase[] = [
  pendingCase(1, '2026-10-06', onTime('2026-10-08', 2)),
  pendingCase(2, '2026-10-08', dueToday('2026-10-08')),
  pendingCase(3, '2026-10-09', overdue('2026-10-08', 1)),
  pendingCase(4, '2026-10-10', overdue('2026-10-08', 1)),
  pendingCase(5, '2026-10-13', overdue('2026-10-08', 2)),
  deliveredCase(6, '2026-10-08', deliveredOnTime('2026-10-08', '2026-10-08')),
  deliveredCase(7, '2026-10-07', deliveredOnTime('2026-10-08', '2026-10-07')),
  deliveredCase(8, '2026-10-09', deliveredLate('2026-10-08', '2026-10-09', 1)),
  deliveredCase(9, '2026-10-12', deliveredLate('2026-10-08', '2026-10-12', 1)),
  deliveredCase(10, '2026-10-08', deliveredOnTime('2026-10-08', '2026-10-08')),
  pendingCase(11, '2026-10-06', onTime('2026-10-08', 2)),
  pendingCase(12, '2026-10-10', onTime('2026-10-16', 4), { arrivedOn: '2026-10-10' }),
  pendingCase(13, '2026-10-14', onTime('2026-10-19', 3), {
    arrivedOn: '2026-10-10',
    city: CAMPINAS,
  }),
  pendingCase(14, '2026-10-04', onTime('2026-10-08', 4), { arrivedOn: '2026-10-04' }),
  pendingCase(15, '2026-10-16', dueToday('2026-10-16'), { arrivedOn: '2026-10-12' }),
  pendingCase(16, '2026-10-19', dueToday('2026-10-19'), {
    arrivedOn: '2026-10-13',
    city: CAMPINAS,
  }),
  pendingCase(31, '2026-10-06', dueToday('2026-10-06'), { days: 1 }),
  pendingCase(32, '2027-01-04', dueToday('2027-01-04'), { days: 60 }),
  pendingCase(33, '2027-01-06', overdue('2027-01-05', 1), { arrivedOn: '2026-12-30' }),
  pendingCase(34, '2027-01-04', overdue('2026-12-30', 2), { arrivedOn: '2026-12-24' }),
  pendingCase(37, '2026-10-10', overdue('2026-10-09', 0), { arrivedOn: '2026-10-06' }),
  deliveredCase(37, '2026-10-10', deliveredLate('2026-10-09', '2026-10-10', 0), {
    arrivedOn: '2026-10-06',
  }),
  pendingCase(38, '2026-10-03', onTime('2026-10-07', 3), { arrivedOn: '2026-10-02' }),
  deliveredCase(39, '2026-10-02', deliveredOnTime('2026-10-08', '2026-10-02')),
]

export type DueOnCase = {
  readonly arrivedOn: string
  readonly city: DeadlineCity
  readonly days: number
  readonly dueOn: string
  readonly line: number
}

export const DUE_ON_CASES: readonly DueOnCase[] = [
  { arrivedOn: '2026-10-13', city: BELO_HORIZONTE, days: 3, dueOn: '2026-10-16', line: 17 },
  { arrivedOn: '2026-10-09', city: CAMPINAS, days: 3, dueOn: '2026-10-16', line: 18 },
  { arrivedOn: '2026-10-09', city: SAO_PAULO, days: 3, dueOn: '2026-10-15', line: 19 },
  { arrivedOn: '2026-07-13', city: CAMPINAS, days: 3, dueOn: '2026-07-17', line: 20 },
  { arrivedOn: '2026-07-13', city: BELO_HORIZONTE, days: 3, dueOn: '2026-07-16', line: 21 },
  { arrivedOn: '2026-07-08', city: SAO_PAULO, days: 3, dueOn: '2026-07-14', line: 22 },
  { arrivedOn: '2026-07-08', city: BELO_HORIZONTE, days: 3, dueOn: '2026-07-13', line: 23 },
  { arrivedOn: '2026-07-08', city: CAMPINAS, days: 3, dueOn: '2026-07-15', line: 24 },
  { arrivedOn: '2026-01-23', city: SAO_PAULO, days: 1, dueOn: '2026-01-26', line: 25 },
  { arrivedOn: '2027-01-22', city: SAO_PAULO, days: 1, dueOn: '2027-01-26', line: 26 },
  { arrivedOn: '2026-10-01', city: CAMPINAS_WITH_SATURDAY, days: 3, dueOn: '2026-10-05', line: 27 },
  { arrivedOn: '2026-10-01', city: CAMPINAS, days: 3, dueOn: '2026-10-06', line: 28 },
  { arrivedOn: '2026-10-03', city: CAMPINAS_WITH_SATURDAY, days: 1, dueOn: '2026-10-05', line: 29 },
  { arrivedOn: '2026-10-03', city: CAMPINAS, days: 1, dueOn: '2026-10-06', line: 30 },
  { arrivedOn: '2028-02-25', city: BELO_HORIZONTE, days: 3, dueOn: '2028-03-03', line: 35 },
  { arrivedOn: '2024-02-28', city: BELO_HORIZONTE, days: 1, dueOn: '2024-02-29', line: 36 },
]

export type NotApplicableCase = {
  readonly line: number
  readonly outcome: DeliveryOutcome
  readonly params: {
    readonly arrivedOn: string | null
    readonly city: DeadlineCity | null
    readonly days: number | null
  }
  readonly reason: DeliveryDeadlineNotApplicableReason
}

const COMPLETE_PARAMS = { arrivedOn: MONDAY, city: BELO_HORIZONTE, days: 3 } as const

export const NOT_APPLICABLE_CASES: readonly NotApplicableCase[] = [
  {
    line: 40,
    outcome: PENDING,
    params: { ...COMPLETE_PARAMS, arrivedOn: null },
    reason: 'no_arrival',
  },
  { line: 41, outcome: PENDING, params: { ...COMPLETE_PARAMS, days: null }, reason: 'no_deadline' },
  { line: 42, outcome: { kind: 'returned' }, params: COMPLETE_PARAMS, reason: 'returned' },
  { line: 43, outcome: { kind: 'cancelled' }, params: COMPLETE_PARAMS, reason: 'cancelled' },
  {
    line: 44,
    outcome: PENDING,
    params: { ...COMPLETE_PARAMS, city: null },
    reason: 'no_destination_city',
  },
  {
    line: 45,
    outcome: { kind: 'returned_to_contractor' },
    params: COMPLETE_PARAMS,
    reason: 'returned_to_contractor',
  },
  { line: 46, outcome: { kind: 'released' }, params: COMPLETE_PARAMS, reason: 'released' },
]
