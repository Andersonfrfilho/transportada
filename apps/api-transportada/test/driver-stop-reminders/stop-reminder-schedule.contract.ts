/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T0.2 (D1–D3, D4, RF2, RF12, RNF6): prazo de cada etapa do lembrete, com relógio injetado. Os valores
 * esperados são somas de minutos escritas à mão, não a chamada inversa da política.
 */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_STOP_REMINDER_DEFAULT_SETTINGS,
  DRIVER_STOP_REMINDER_FALLBACK_TRAVEL_SECONDS,
} from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'
import {
  computeNextStopReminderDueAt,
  computeStopReminderSchedule,
  decideStopReminderDueAction,
} from '../../src/driver-stop-reminders/domain/stop-reminder-schedule.policy.js'

const MINUTE = 60_000
const DEPARTED_AT = new Date('2026-11-09T17:05:00.000Z')
const plusMinutes = (base: Date, minutes: number): Date =>
  new Date(base.getTime() + minutes * MINUTE)

const settings = {
  maxAttempts: 3,
  intervalMinutes: 30,
  graceMinMinutes: 30,
  gracePercent: 50,
  dwellMinutes: 30,
}

describe('defaults da empresa (D3, D4, RF19)', () => {
  test('3 cobranças, 30 min entre elas, folga 30 min / 50%, permanência 30 min', () => {
    expect(DRIVER_STOP_REMINDER_DEFAULT_SETTINGS).toEqual(settings)
  })

  test('viagem de reserva dura 45 min', () => {
    expect(DRIVER_STOP_REMINDER_FALLBACK_TRAVEL_SECONDS).toBe(45 * 60)
  })
})

describe('etapa arrival: saída + viagem + max(folga mínima, % da viagem)', () => {
  test('viagem curta usa o piso: 35 + max(30, 17,5) = 65 min (critério de aceite 1)', () => {
    const schedule = computeStopReminderSchedule({
      stage: 'arrival',
      anchorAt: DEPARTED_AT,
      travelSeconds: 35 * 60,
      settings,
    })
    expect(schedule.expectedAt).toEqual(plusMinutes(DEPARTED_AT, 35))
    expect(schedule.dueAt).toEqual(plusMinutes(DEPARTED_AT, 65))
  })

  test('viagem longa usa o percentual: 120 + max(30, 60) = 180 min', () => {
    const schedule = computeStopReminderSchedule({
      stage: 'arrival',
      anchorAt: DEPARTED_AT,
      travelSeconds: 120 * 60,
      settings,
    })
    expect(schedule.expectedAt).toEqual(plusMinutes(DEPARTED_AT, 120))
    expect(schedule.dueAt).toEqual(plusMinutes(DEPARTED_AT, 180))
  })

  test('empate piso = percentual (60 min → 30 = 30): 60 + 30 = 90 min', () => {
    const schedule = computeStopReminderSchedule({
      stage: 'arrival',
      anchorAt: DEPARTED_AT,
      travelSeconds: 60 * 60,
      settings,
    })
    expect(schedule.dueAt).toEqual(plusMinutes(DEPARTED_AT, 90))
  })

  test('folga mínima e percentual da empresa valem: 40 min, 100% sobre 50 min → 50 + max(40, 50) = 100 min', () => {
    const schedule = computeStopReminderSchedule({
      stage: 'arrival',
      anchorAt: DEPARTED_AT,
      travelSeconds: 50 * 60,
      settings: { ...settings, graceMinMinutes: 40, gracePercent: 100 },
    })
    expect(schedule.dueAt).toEqual(plusMinutes(DEPARTED_AT, 100))
  })

  test('sem tempo de viagem (roteamento fora do ar) usa 45 min: 45 + max(30, 22,5) = 75 min; a previsão também', () => {
    const schedule = computeStopReminderSchedule({
      stage: 'arrival',
      anchorAt: DEPARTED_AT,
      travelSeconds: undefined,
      settings,
    })
    expect(schedule.expectedAt).toEqual(plusMinutes(DEPARTED_AT, 45))
    expect(schedule.dueAt).toEqual(plusMinutes(DEPARTED_AT, 75))
  })

  test('não lê o relógio: mesma entrada, mesma saída', () => {
    const input = {
      stage: 'arrival' as const,
      anchorAt: DEPARTED_AT,
      travelSeconds: 35 * 60,
      settings,
    }
    expect(computeStopReminderSchedule(input)).toEqual(computeStopReminderSchedule(input))
  })
})

describe('etapa settlement: chegada + permanência (RF2)', () => {
  const arrivedAt = new Date('2026-11-09T17:41:00.000Z')

  test('permanência padrão de 30 min (critério de aceite 2: 14:41 → 15:11)', () => {
    const schedule = computeStopReminderSchedule({
      stage: 'settlement',
      anchorAt: arrivedAt,
      travelSeconds: undefined,
      settings,
    })
    expect(schedule.dueAt).toEqual(new Date('2026-11-09T18:11:00.000Z'))
  })

  test('permanência da empresa: 45 min', () => {
    const schedule = computeStopReminderSchedule({
      stage: 'settlement',
      anchorAt: arrivedAt,
      travelSeconds: undefined,
      settings: { ...settings, dwellMinutes: 45 },
    })
    expect(schedule.dueAt).toEqual(plusMinutes(arrivedAt, 45))
  })

  test('o tempo de viagem não entra no settlement', () => {
    const schedule = computeStopReminderSchedule({
      stage: 'settlement',
      anchorAt: arrivedAt,
      travelSeconds: 600 * 60,
      settings,
    })
    expect(schedule.dueAt).toEqual(plusMinutes(arrivedAt, 30))
  })
})

describe('próximo prazo e fim das tentativas (RF12, D4)', () => {
  const lastSentAt = new Date('2026-11-09T18:10:00.000Z')

  test('próximo prazo = último envio + intervalo (30 min)', () => {
    expect(computeNextStopReminderDueAt({ lastSentAt, settings })).toEqual(
      new Date('2026-11-09T18:40:00.000Z'),
    )
  })

  test('intervalo da empresa: 10 min', () => {
    expect(
      computeNextStopReminderDueAt({ lastSentAt, settings: { ...settings, intervalMinutes: 10 } }),
    ).toEqual(new Date('2026-11-09T18:20:00.000Z'))
  })

  test('com tentativas sobrando cobra; esgotadas escala', () => {
    expect(decideStopReminderDueAction({ attempts: 0, maxAttempts: 3 })).toBe('send')
    expect(decideStopReminderDueAction({ attempts: 2, maxAttempts: 3 })).toBe('send')
    expect(decideStopReminderDueAction({ attempts: 3, maxAttempts: 3 })).toBe('escalate')
    expect(decideStopReminderDueAction({ attempts: 1, maxAttempts: 1 })).toBe('escalate')
  })
})
