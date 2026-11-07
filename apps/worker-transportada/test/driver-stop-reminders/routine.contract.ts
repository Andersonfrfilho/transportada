/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.4 (RF7, RF20): o laço da rotina — chave global desligada não lê nada, cada vencido vai à API
 * com a própria empresa, os quatro desfechos são contados, e API fora encerra o ciclo. O log só leva ids e números.
 */
import { describe, expect, test } from 'bun:test'

import { DriverStopReminderApiError } from '../../src/driver-stop-reminders/application/driver-stop-reminder-api.error.js'
import type { DriverStopReminderApiPort } from '../../src/driver-stop-reminders/application/driver-stop-reminder-api.port.js'
import type {
  DriverStopReminderQueuePort,
  DueDriverStopReminder,
  ListDueDriverStopRemindersParams,
} from '../../src/driver-stop-reminders/application/driver-stop-reminder-queue.port.js'
import { createDriverStopReminderRoutine } from '../../src/driver-stop-reminders/application/driver-stop-reminder.routine.js'
import {
  DRIVER_STOP_REMINDER_BATCH_SIZE,
  DRIVER_STOP_REMINDER_DISPATCH_JOB,
  DRIVER_STOP_REMINDER_MAX_PER_CYCLE,
} from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'

const NOW = new Date('2026-11-09T12:00:00.000Z')

function buildReminder(index: number): DueDriverStopReminder {
  return {
    companyId: index % 2 === 0 ? 'company-a' : 'company-b',
    reminderId: `reminder-${String(index).padStart(3, '0')}`,
  }
}

type DeliverResult = Awaited<ReturnType<DriverStopReminderApiPort['deliver']>>

function buildHarness(input: {
  readonly deliver?: (reminder: DueDriverStopReminder) => DeliverResult
  readonly enabled?: boolean
  readonly reminders: readonly DueDriverStopReminder[]
  readonly stopAfterDeliveries?: number
}) {
  const listCalls: ListDueDriverStopRemindersParams[] = []
  const delivered: DueDriverStopReminder[] = []
  const captured: unknown[] = []
  const logs: { message: string; metadata: unknown }[] = []

  const queue: DriverStopReminderQueuePort = {
    async listDue(params) {
      listCalls.push(params)
      const excluded = new Set(params.excludeReminderIds)
      return input.reminders.filter((item) => !excluded.has(item.reminderId)).slice(0, params.limit)
    },
  }
  const reminderApi: DriverStopReminderApiPort = {
    async deliver(params) {
      delivered.push(params)
      return input.deliver?.(params) ?? { nextDueAt: null, outcome: 'sent' }
    },
  }
  const routine = createDriverStopReminderRoutine({
    enabled: input.enabled ?? true,
    errorTracker: { captureException: (error: unknown) => captured.push(error) },
    logger: {
      error: (message, metadata) => logs.push({ message, metadata }),
      info: (message, metadata) => logs.push({ message, metadata }),
      warn: (message, metadata) => logs.push({ message, metadata }),
    },
    now: () => NOW,
    queue,
    reminderApi,
  })
  const context = {
    correlationId: 'correlation-1',
    executionId: 'execution-1',
    isStopRequested: () =>
      input.stopAfterDeliveries !== undefined && delivered.length >= input.stopAfterDeliveries,
    job: DRIVER_STOP_REMINDER_DISPATCH_JOB,
    origin: 'schedule',
  } as const
  return { captured, delivered, listCalls, logs, run: () => routine.run(context) }
}

describe('driver stop reminder routine', () => {
  test('with the global key off the cycle succeeds and reads nothing', async () => {
    const harness = buildHarness({ enabled: false, reminders: [buildReminder(0)] })

    const result = await harness.run()

    expect(result.outcome).toBe('succeeded')
    expect(harness.listCalls).toHaveLength(0)
    expect(harness.delivered).toHaveLength(0)
    expect(result.counters).toMatchObject({ remindersSeen: 0, sent: 0 })
  })

  test('asks the queue for the batch size at the current instant', async () => {
    const harness = buildHarness({ reminders: [] })

    await harness.run()

    expect(harness.listCalls[0]).toMatchObject({ limit: DRIVER_STOP_REMINDER_BATCH_SIZE, now: NOW })
    expect(DRIVER_STOP_REMINDER_BATCH_SIZE).toBe(50)
  })

  test('delivers each due reminder under its own company and counts the four outcomes apart', async () => {
    const reminders = [0, 1, 2, 3].map(buildReminder)
    const outcomes = ['sent', 'deferred', 'closed', 'escalated'] as const
    const harness = buildHarness({
      deliver: ({ reminderId }) => ({
        nextDueAt: null,
        outcome: outcomes[reminders.findIndex((item) => item.reminderId === reminderId)] ?? 'sent',
      }),
      reminders,
    })

    const result = await harness.run()

    expect(harness.delivered).toEqual(reminders)
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({
      closed: 1,
      deferred: 1,
      escalated: 1,
      remindersSeen: 4,
      sent: 1,
    })
  })

  test('does not list the same reminder twice and stops when the batch comes back short', async () => {
    const reminders = Array.from({ length: DRIVER_STOP_REMINDER_BATCH_SIZE + 3 }, (_, i) =>
      buildReminder(i),
    )
    const harness = buildHarness({ reminders })

    await harness.run()

    expect(harness.listCalls).toHaveLength(2)
    expect(harness.listCalls[1]?.excludeReminderIds).toHaveLength(DRIVER_STOP_REMINDER_BATCH_SIZE)
    expect(harness.delivered).toHaveLength(reminders.length)
  })

  test('caps the reminders per cycle', async () => {
    const reminders = Array.from({ length: DRIVER_STOP_REMINDER_MAX_PER_CYCLE + 20 }, (_, i) =>
      buildReminder(i),
    )
    const harness = buildHarness({ reminders })

    await harness.run()

    expect(harness.delivered).toHaveLength(DRIVER_STOP_REMINDER_MAX_PER_CYCLE)
  })

  test('stops at the unit boundary when a stop is requested', async () => {
    const harness = buildHarness({
      reminders: Array.from({ length: 5 }, (_, i) => buildReminder(i)),
      stopAfterDeliveries: 2,
    })

    const result = await harness.run()

    expect(harness.delivered).toHaveLength(2)
    expect(result.outcome).toBe('succeeded')
  })

  test('a rejected request is counted and the rest of the batch goes on', async () => {
    const harness = buildHarness({
      deliver: ({ reminderId }) => {
        if (reminderId === 'reminder-000')
          throw new DriverStopReminderApiError('request_rejected', 404)
        return { nextDueAt: null, outcome: 'sent' }
      },
      reminders: [buildReminder(0), buildReminder(1)],
    })

    const result = await harness.run()

    expect(harness.delivered).toHaveLength(2)
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ requestRejected: 1, sent: 1 })
  })

  test('an unexpected failure is isolated, reported to the tracker and counted', async () => {
    const harness = buildHarness({
      deliver: ({ reminderId }) => {
        if (reminderId === 'reminder-000') throw new Error('boom')
        return { nextDueAt: null, outcome: 'sent' }
      },
      reminders: [buildReminder(0), buildReminder(1)],
    })

    const result = await harness.run()

    expect(harness.delivered).toHaveLength(2)
    expect(harness.captured).toHaveLength(1)
    expect(result.counters).toMatchObject({ sent: 1, unexpectedErrors: 1 })
  })

  test('an unreachable API ends the cycle as api_unreachable instead of burning the batch', async () => {
    const harness = buildHarness({
      deliver: () => {
        throw new DriverStopReminderApiError('api_unreachable', 503)
      },
      reminders: Array.from({ length: 5 }, (_, i) => buildReminder(i)),
    })

    const result = await harness.run()

    expect(harness.delivered).toHaveLength(1)
    expect(result.outcome).toBe('api_unreachable')
    expect(result.counters).toMatchObject({ apiUnreachable: 1 })
  })

  test('a refused robot credential ends the cycle as api_unreachable and reaches the tracker', async () => {
    const harness = buildHarness({
      deliver: () => {
        throw new DriverStopReminderApiError('api_unauthorized', 401)
      },
      reminders: [buildReminder(0), buildReminder(1)],
    })

    const result = await harness.run()

    expect(harness.delivered).toHaveLength(1)
    expect(result.outcome).toBe('api_unreachable')
    expect(result.counters).toMatchObject({ apiUnauthorized: 1 })
    expect(harness.captured).toHaveLength(1)
  })

  test('the cycle log carries ids and numbers only', async () => {
    const harness = buildHarness({ reminders: [buildReminder(0)] })

    await harness.run()

    const metadata = harness.logs.find(
      (entry) => entry.message === 'driver_stop_reminder_cycle_finished',
    )?.metadata as Record<string, unknown>
    expect(metadata).toMatchObject({ correlationId: 'correlation-1', sent: 1 })
    expect(JSON.stringify(metadata)).not.toContain('reminder-000')
  })
})
