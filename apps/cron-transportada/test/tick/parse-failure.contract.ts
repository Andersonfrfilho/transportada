/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Rotina vencida que o catálogo do cron desconhece: o envelope não passa no schema depois que a
 * execução já foi aberta. A linha tem de ser fechada na hora — aberta, ela trava a rotina até a
 * varredura de abandono e a batida seguinte repete o mesmo erro.
 */
import { describe, expect, test } from 'bun:test'

import { runTickCycle } from '../../src/tick/application/run-tick.js'
import { JOB_TICK_PUBLISH_FAILURE_OUTCOME } from '../../src/tick/domain/tick.constant.js'
import { createJobScheduleDouble } from './job-schedule.double.js'
import {
  createEventIdFactory,
  createLockDouble,
  createLoggerDouble,
  createPublisherDouble,
} from './tick.double.js'

const NOW = new Date('2026-11-07T12:55:32.000Z')
const UNKNOWN_JOB = 'job.unknown.to.the.cron.catalog'

describe('cron tick closes the execution when the envelope is rejected', () => {
  test('a job unknown to the catalog finishes with the failure outcome and counts as failed', async () => {
    const schedules = createJobScheduleDouble([
      {
        enabled: true,
        intervalSeconds: 300,
        job: UNKNOWN_JOB as never,
        nextRunAt: new Date('2026-11-07T12:50:00.000Z'),
      },
    ])
    const publisher = createPublisherDouble()

    const result = await runTickCycle({
      correlationId: 'tick-correlation',
      lock: createLockDouble(true),
      logger: createLoggerDouble(),
      newEventId: createEventIdFactory(),
      now: NOW,
      publisher,
      schedules,
    })

    expect(result.failedCount).toBe(1)
    expect(result.publishedCount).toBe(0)
    expect(publisher.published).toEqual([])
    expect(schedules.executions.filter((row) => row.finishedAt === undefined)).toEqual([])
    expect(schedules.executions[0]).toMatchObject({
      finishedAt: NOW,
      outcome: JOB_TICK_PUBLISH_FAILURE_OUTCOME,
    })
  })
})
