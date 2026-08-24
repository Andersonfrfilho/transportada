/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  JOB_RUN_LEASE_RENEWAL_SECONDS,
  startLeaseHeartbeat,
} from '../../src/job-run/application/lease-heartbeat.js'
import { JOB_RUN_LEASE_SECONDS, runJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type {
  JobRoutineContext,
  JobRoutineResult,
} from '../../src/job-run/application/job-routine.port.js'
import type { JobRunEnvelopeV1 } from '../../src/messaging/job-run-envelope.schema.js'

import {
  createExecutionDouble,
  createLoggerDouble,
  createManualScheduler,
  type LoggedMessage,
} from './job-run.double.js'

const EXECUTION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const NOW = new Date('2026-08-23T09:00:00.000Z')

const ENVELOPE: JobRunEnvelopeV1 = {
  correlationId: 'tick-2026-08-23T09:00:00.000Z',
  eventId: '0f7c4a3e-9b1d-4e2f-8a5c-6d7e8f9a0b1c',
  occurredAt: '2026-08-23T09:00:00.000Z',
  payload: { executionId: EXECUTION_ID, job: 'fuel.price.pull', origin: 'schedule' },
  type: 'transportada.job.run.requested',
  version: 1,
}

function leaseAfter(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * 1000)
}

describe('job run lease heartbeat', () => {
  test('o batimento é um terço do lease — a linha só fica abandonável depois de três falhas', () => {
    expect(JOB_RUN_LEASE_RENEWAL_SECONDS * 3).toBe(JOB_RUN_LEASE_SECONDS)
  })

  test('renovar estende o lease pelo lease inteiro, contado do agora', async () => {
    const executions = createExecutionDouble()
    const scheduler = createManualScheduler()
    let clock = NOW

    await executions.claim({ executionId: EXECUTION_ID, leaseExpiresAt: leaseAfter(30), now: NOW })

    const heartbeat = startLeaseHeartbeat({
      executionId: EXECUTION_ID,
      executions,
      leaseExpiresAt: leaseAfter(30),
      leaseSeconds: JOB_RUN_LEASE_SECONDS,
      logger: createLoggerDouble([]),
      metadata: { executionId: EXECUTION_ID },
      now: () => clock,
      schedule: scheduler.scheduler,
    })

    expect(scheduler.milliseconds()).toBe(JOB_RUN_LEASE_RENEWAL_SECONDS * 1000)

    clock = leaseAfter(10)
    await scheduler.beat()

    expect(executions.row.leaseExpiresAt).toEqual(leaseAfter(40))
    expect(heartbeat.isStopRequested()).toBe(false)

    heartbeat.stop()
    expect(scheduler.cancelled()).toBe(true)
  })

  test('rotina mais lenta que o lease não é abandonada viva: cada batimento empurra o prazo', async () => {
    const executions = createExecutionDouble()
    const scheduler = createManualScheduler()
    let clock = NOW

    await executions.claim({ executionId: EXECUTION_ID, leaseExpiresAt: leaseAfter(30), now: NOW })

    startLeaseHeartbeat({
      executionId: EXECUTION_ID,
      executions,
      leaseExpiresAt: leaseAfter(30),
      leaseSeconds: JOB_RUN_LEASE_SECONDS,
      logger: createLoggerDouble([]),
      metadata: { executionId: EXECUTION_ID },
      now: () => clock,
      schedule: scheduler.scheduler,
    })

    for (const elapsed of [10, 20, 30, 40, 50, 60]) {
      clock = leaseAfter(elapsed)
      await scheduler.beat()
      // Em nenhum instante o prazo gravado ficou para trás do relógio.
      expect(executions.row.leaseExpiresAt?.getTime()).toBeGreaterThan(clock.getTime())
    }

    expect(executions.row.leaseExpiresAt).toEqual(leaseAfter(90))
  })

  test('lease tomado por outro processo é lease perdido, e o ciclo em curso larga a linha', async () => {
    const executions = createExecutionDouble()
    const scheduler = createManualScheduler()
    const logged: LoggedMessage[] = []

    await executions.claim({ executionId: EXECUTION_ID, leaseExpiresAt: leaseAfter(30), now: NOW })

    const heartbeat = startLeaseHeartbeat({
      executionId: EXECUTION_ID,
      executions,
      leaseExpiresAt: leaseAfter(30),
      leaseSeconds: JOB_RUN_LEASE_SECONDS,
      logger: createLoggerDouble(logged),
      metadata: { executionId: EXECUTION_ID },
      now: () => leaseAfter(10),
      schedule: scheduler.scheduler,
    })

    // O worker morreu por dez minutos; a varredura abandonou a linha e outro processo a pegou.
    executions.row.leaseExpiresAt = leaseAfter(900)

    await scheduler.beat()

    expect(heartbeat.isLeaseLost()).toBe(true)
    expect(heartbeat.isStopRequested()).toBe(true)
    expect(logged.some((entry) => entry.message === 'job_run_lease_lost')).toBe(true)
    // O prazo do novo dono não foi mexido.
    expect(executions.row.leaseExpiresAt).toEqual(leaseAfter(900))
  })

  test('queda de banco no batimento não derruba a rotina — o lease é que vence sozinho', async () => {
    const executions = createExecutionDouble()
    const scheduler = createManualScheduler()
    const logged: LoggedMessage[] = []

    await executions.claim({ executionId: EXECUTION_ID, leaseExpiresAt: leaseAfter(30), now: NOW })
    executions.failRenewals(new Error('connection terminated'))

    const heartbeat = startLeaseHeartbeat({
      executionId: EXECUTION_ID,
      executions,
      leaseExpiresAt: leaseAfter(30),
      leaseSeconds: JOB_RUN_LEASE_SECONDS,
      logger: createLoggerDouble(logged),
      metadata: { executionId: EXECUTION_ID },
      now: () => leaseAfter(10),
      schedule: scheduler.scheduler,
    })

    await scheduler.beat()

    expect(heartbeat.isStopRequested()).toBe(false)
    expect(heartbeat.isLeaseLost()).toBe(false)
    const failure = logged.find((entry) => entry.message === 'job_run_lease_renewal_failed')
    expect(failure).toBeDefined()
    // A mensagem da exceção pode trazer corpo de terceiro; só o nome do erro entra no log.
    expect(failure?.metadata).toEqual({ executionId: EXECUTION_ID, reason: 'Error' })
  })

  test('batimento parado não continua escrevendo depois do fim do ciclo', async () => {
    const executions = createExecutionDouble()
    const scheduler = createManualScheduler()

    await executions.claim({ executionId: EXECUTION_ID, leaseExpiresAt: leaseAfter(30), now: NOW })

    const heartbeat = startLeaseHeartbeat({
      executionId: EXECUTION_ID,
      executions,
      leaseExpiresAt: leaseAfter(30),
      leaseSeconds: JOB_RUN_LEASE_SECONDS,
      logger: createLoggerDouble([]),
      metadata: { executionId: EXECUTION_ID },
      now: () => leaseAfter(10),
      schedule: scheduler.scheduler,
    })

    heartbeat.stop()
    await scheduler.beat()

    expect(executions.renewals).toEqual([])
  })
})

describe('job run cycle lease', () => {
  test('o ciclo agenda o batimento e o desliga ao terminar, mesmo com a rotina estourando', async () => {
    const executions = createExecutionDouble()
    const scheduler = createManualScheduler()

    await runJobCycle({
      dependencies: {
        executions,
        logger: createLoggerDouble([]),
        now: () => NOW,
        routines: {
          'fuel.price.pull': {
            run: (): Promise<JobRoutineResult> => Promise.reject(new Error('anp fora do ar')),
          },
        },
        scheduleInterval: scheduler.scheduler,
      },
      envelope: ENVELOPE,
    })

    expect(scheduler.milliseconds()).toBe(JOB_RUN_LEASE_RENEWAL_SECONDS * 1000)
    expect(scheduler.cancelled()).toBe(true)
    expect(executions.row.outcome).toBe('unexpected_error')
  })

  test('lease perdido no meio: a rotina para, e o desfecho dela já não escreve na linha', async () => {
    const executions = createExecutionDouble()
    const scheduler = createManualScheduler()
    const logged: LoggedMessage[] = []
    const seen: boolean[] = []

    const routine = {
      run: async (context: JobRoutineContext): Promise<JobRoutineResult> => {
        // A varredura abandonou a linha enquanto a primeira unidade corria.
        executions.row.finishedAt = new Date(NOW.getTime() + 600_000)
        executions.row.outcome = 'abandoned'
        executions.row.leaseExpiresAt = undefined

        await scheduler.beat()
        seen.push(context.isStopRequested())
        return { counters: { statesWritten: 1 }, outcome: 'succeeded' }
      },
    }

    const result = await runJobCycle({
      dependencies: {
        executions,
        logger: createLoggerDouble(logged),
        now: () => NOW,
        routines: { 'fuel.price.pull': routine },
        scheduleInterval: scheduler.scheduler,
      },
      envelope: ENVELOPE,
    })

    expect(seen).toEqual([true])
    expect(result.outcome).toBe('succeeded')
    expect(logged.some((entry) => entry.message === 'job_run_lease_lost')).toBe(true)
    // O `finish` condicional recusou: quem gravou o desfecho foi a varredura, não este ciclo.
    expect(executions.row.outcome).toBe('abandoned')
    expect(executions.row.counters).toEqual({})
  })
})
