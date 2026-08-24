/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  JOB_MINIMUM_INTERVAL_SECONDS,
  SCHEDULED_JOBS,
} from '../../src/shared/job-catalog.constant.js'
import { resolveNextRunAt } from '../../src/tick/domain/next-run.policy.js'
import { runTickCycle } from '../../src/tick/application/run-tick.js'
import { createJobScheduleDouble, type ScheduleRow } from './job-schedule.double.js'
import {
  createEventIdFactory,
  createLockDouble,
  createPublisherDouble,
  SILENT_LOGGER,
} from './tick.double.js'

const NOW = new Date('2026-08-23T12:00:00.000Z')

function scheduleRow(overrides: Partial<ScheduleRow> & Pick<ScheduleRow, 'job'>): ScheduleRow {
  return {
    enabled: true,
    intervalSeconds: 300,
    nextRunAt: new Date('2026-08-23T11:40:00.000Z'),
    ...overrides,
  }
}

function runCycle(rows: readonly ScheduleRow[], failFor?: string) {
  const schedules = createJobScheduleDouble(rows)
  const result = runTickCycle({
    correlationId: 'tick-correlation',
    lock: createLockDouble(true),
    logger: SILENT_LOGGER,
    newEventId: createEventIdFactory(),
    now: NOW,
    publisher: createPublisherDouble(failFor === undefined ? {} : { failFor }),
    schedules,
  })
  return { result, schedules }
}

describe('cron tick advances the window', () => {
  test('the next window counts from the cycle that ran, never from the one that was missed', () => {
    // Grade fixa faria a rotina atrasada disparar de novo na batida seguinte, e outra vez na
    // seguinte, até "alcançar" o relógio — o intervalo é distância entre ciclos reais.
    expect(resolveNextRunAt({ intervalSeconds: 300, now: NOW })).toEqual(
      new Date('2026-08-23T12:05:00.000Z'),
    )
    expect(resolveNextRunAt({ intervalSeconds: 86_400, now: NOW })).toEqual(
      new Date('2026-08-24T12:00:00.000Z'),
    )
  })

  test('a published routine has its window pushed by its own interval', async () => {
    const { result, schedules } = runCycle([
      scheduleRow({ intervalSeconds: 300, job: 'nfse.status.pull' }),
      scheduleRow({ intervalSeconds: 86_400, job: 'fuel.price.pull' }),
    ])

    await result
    expect(schedules.scheduleOf('nfse.status.pull').nextRunAt).toEqual(
      new Date('2026-08-23T12:05:00.000Z'),
    )
    expect(schedules.scheduleOf('fuel.price.pull').nextRunAt).toEqual(
      new Date('2026-08-24T12:00:00.000Z'),
    )
  })

  test('a disabled routine keeps the window it had — pause is not a silent reschedule', async () => {
    const untouched = new Date('2026-08-23T11:40:00.000Z')
    const { result, schedules } = runCycle([
      scheduleRow({ enabled: false, job: 'notification.schedules.run', nextRunAt: untouched }),
    ])

    await result
    expect(schedules.scheduleOf('notification.schedules.run').nextRunAt).toEqual(untouched)
  })

  test('a routine still running keeps its window, so the next tick tries it again', async () => {
    const overdue = new Date('2026-08-23T11:40:00.000Z')
    const schedules = createJobScheduleDouble([
      scheduleRow({ job: 'nfe.distribution.pull', nextRunAt: overdue }),
    ])
    const started = await schedules.start({
      correlationId: 'earlier-cycle',
      job: 'nfe.distribution.pull',
      nextRunAt: overdue,
      startedAt: new Date('2026-08-23T11:40:00.000Z'),
    })
    // Correndo de verdade é segurar lease vivo: sem ele a varredura de abandono a recolheria, que é
    // exatamente o que se quer para o worker morto e exatamente o que não se quer aqui.
    const row = schedules.executions.find((candidate) => candidate.id === started?.executionId)
    if (row === undefined) throw new Error('OPEN_EXECUTION_NOT_FOUND')
    row.leaseExpiresAt = new Date(NOW.getTime() + 20_000)

    await runTickCycle({
      correlationId: 'tick-correlation',
      lock: createLockDouble(true),
      logger: SILENT_LOGGER,
      newEventId: createEventIdFactory(),
      now: NOW,
      publisher: createPublisherDouble(),
      schedules,
    })

    expect(schedules.scheduleOf('nfe.distribution.pull').nextRunAt).toEqual(overdue)
  })

  test('a routine that failed to publish keeps the window it was given', async () => {
    // A janela avança junto com a abertura da execução, e é o que impede a batida seguinte de
    // republicar a mesma rotina antes de ela ter tido tempo de correr.
    const { result, schedules } = runCycle(
      [scheduleRow({ job: 'fuel.price.pull', intervalSeconds: 86_400 })],
      'fuel.price.pull',
    )

    await result
    expect(schedules.scheduleOf('fuel.price.pull').nextRunAt).toEqual(
      new Date('2026-08-24T12:00:00.000Z'),
    )
  })

  test('the tick never resolves a window below the floor the catalog gives each routine', () => {
    for (const job of SCHEDULED_JOBS) {
      const intervalSeconds = JOB_MINIMUM_INTERVAL_SECONDS[job]
      expect(resolveNextRunAt({ intervalSeconds, now: NOW }).getTime() - NOW.getTime()).toBe(
        intervalSeconds * 1_000,
      )
    }
  })
})
