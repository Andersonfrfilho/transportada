/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { JOB_TICK_LOCK_KEY } from '../../src/tick/domain/tick.constant.js'
import { runTickCycle } from '../../src/tick/application/run-tick.js'
import { createJobScheduleDouble, type ScheduleRow } from './job-schedule.double.js'
import {
  createEventIdFactory,
  createLockDouble,
  createPublisherDouble,
  SILENT_LOGGER,
} from './tick.double.js'

const NOW = new Date('2026-08-23T12:00:00.000Z')
const CORRELATION_ID = 'tick-correlation'

function scheduleRow(overrides: Partial<ScheduleRow> & Pick<ScheduleRow, 'job'>): ScheduleRow {
  return {
    enabled: true,
    intervalSeconds: 300,
    nextRunAt: new Date('2026-08-23T11:55:00.000Z'),
    ...overrides,
  }
}

type RunParams = {
  readonly granted?: boolean
  readonly failFor?: string
  readonly rows: readonly ScheduleRow[]
}

function runCycle(params: RunParams) {
  const schedules = createJobScheduleDouble(params.rows)
  const lock = createLockDouble(params.granted ?? true)
  const publisher = createPublisherDouble(
    params.failFor === undefined ? {} : { failFor: params.failFor },
  )

  const result = runTickCycle({
    correlationId: CORRELATION_ID,
    lock,
    logger: SILENT_LOGGER,
    newEventId: createEventIdFactory(),
    now: NOW,
    publisher,
    schedules,
  })

  return { lock, publisher, result, schedules }
}

describe('cron tick selects what is due', () => {
  test('publishes only the enabled routines whose window has come', async () => {
    const { publisher, result } = runCycle({
      rows: [
        scheduleRow({ job: 'nfe.distribution.pull' }),
        scheduleRow({ job: 'nfse.status.pull', nextRunAt: NOW }),
        scheduleRow({ job: 'fuel.price.pull', nextRunAt: new Date('2026-08-23T12:00:01.000Z') }),
        scheduleRow({ enabled: false, job: 'notification.schedules.run' }),
      ],
    })

    expect(await result).toEqual({
      abandonedCount: 0,
      acquiredLock: true,
      dueCount: 2,
      failedCount: 0,
      publishedCount: 2,
      skippedCount: 0,
    })
    expect(publisher.published.map((envelope) => envelope.payload.job)).toEqual([
      'nfe.distribution.pull',
      'nfse.status.pull',
    ])
  })

  test('every published envelope carries the execution it opened, with origin schedule', async () => {
    const { publisher, result, schedules } = runCycle({
      rows: [scheduleRow({ job: 'fuel.price.pull' })],
    })

    await result
    const [envelope] = publisher.published
    const [execution] = schedules.executions

    expect(envelope?.payload).toEqual({
      executionId: execution?.id ?? '',
      job: 'fuel.price.pull',
      origin: 'schedule',
    })
    expect(envelope?.correlationId).toBe(CORRELATION_ID)
    expect(execution?.origin).toBe('schedule')
    expect(execution?.startedAt).toEqual(NOW)
  })

  test('a routine already running is skipped instead of published twice', async () => {
    const schedules = createJobScheduleDouble([scheduleRow({ job: 'nfse.status.pull' })])
    await schedules.start({
      correlationId: 'earlier-cycle',
      job: 'nfse.status.pull',
      nextRunAt: NOW,
      startedAt: new Date('2026-08-23T11:50:00.000Z'),
    })
    const publisher = createPublisherDouble()

    const result = await runTickCycle({
      correlationId: CORRELATION_ID,
      lock: createLockDouble(true),
      logger: SILENT_LOGGER,
      newEventId: createEventIdFactory(),
      now: NOW,
      publisher,
      schedules,
    })

    expect(publisher.published).toEqual([])
    expect(result).toEqual({
      abandonedCount: 0,
      acquiredLock: true,
      dueCount: 1,
      failedCount: 0,
      publishedCount: 0,
      skippedCount: 1,
    })
  })

  test('without the advisory lock the cycle is a clean no-op', async () => {
    const { lock, publisher, result, schedules } = runCycle({
      granted: false,
      rows: [scheduleRow({ job: 'nfe.distribution.pull' })],
    })

    expect(await result).toEqual({
      abandonedCount: 0,
      acquiredLock: false,
      dueCount: 0,
      failedCount: 0,
      publishedCount: 0,
      skippedCount: 0,
    })
    expect(publisher.published).toEqual([])
    expect(schedules.executions).toEqual([])
    expect(lock.acquiredKeys).toEqual([JOB_TICK_LOCK_KEY])
    expect(lock.releasedKeys).toEqual([])
  })

  test('the lock is released even when a routine fails to publish', async () => {
    const { lock, result } = runCycle({
      failFor: 'fuel.price.pull',
      rows: [scheduleRow({ job: 'fuel.price.pull' })],
    })

    await result
    expect(lock.releasedKeys).toEqual([JOB_TICK_LOCK_KEY])
  })

  test('a broker failure isolates one routine and closes the execution it opened', async () => {
    const { publisher, result, schedules } = runCycle({
      failFor: 'fuel.price.pull',
      rows: [
        scheduleRow({ job: 'fuel.price.pull' }),
        scheduleRow({ job: 'notification.schedules.run' }),
      ],
    })

    expect(await result).toEqual({
      abandonedCount: 0,
      acquiredLock: true,
      dueCount: 2,
      failedCount: 1,
      publishedCount: 1,
      skippedCount: 0,
    })
    expect(publisher.published.map((envelope) => envelope.payload.job)).toEqual([
      'notification.schedules.run',
    ])

    // Execução aberta e nunca fechada é rotina travada para sempre: o 409 do botão a recusaria
    // sem que nada estivesse correndo.
    const failed = schedules.executions.find((row) => row.job === 'fuel.price.pull')
    expect(failed?.finishedAt).toEqual(NOW)
    expect(failed?.outcome).toBe('unexpected_error')
  })
})
