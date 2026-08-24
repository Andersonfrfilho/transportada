/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O varredor de avisos visto como rotina do relógio. Aqui se guarda o **ciclo**: quantas faturas
 * viraram aviso, que rotinas do módulo de notificação correram, e com que código a linha fecha
 * quando alguma delas cai.
 *
 * Duas coisas desta rotina não existem nas outras duas, e são o motivo deste arquivo:
 *
 * 1. Uma rotina que falha **não interrompe as seguintes**. As três do módulo são independentes
 *    (despachar o que venceu, purgar o que expirou), e deixar de purgar porque o despacho caiu
 *    seria retenção de conteúdo endereçado a uma pessoa por causa de um erro em outro assunto.
 * 2. O vocabulário do catálogo tem **duas** palavras (`queue_unreachable` · `template_missing`) e o
 *    resto do mundo é `unexpected_error`. Quem classifica é a causa tipada, não a semelhança da
 *    mensagem de erro: um `Error` genérico de biblioteca não pode virar "fila fora do ar".
 */
import { describe, expect, test } from 'bun:test'

import type {
  ClaimedJobExecution,
  FinishJobExecutionParams,
  JobExecutionPort,
} from '../../src/job-run/application/job-execution.port.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { runJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type { JobRunEnvelopeV1 } from '../../src/messaging/job-run-envelope.schema.js'
import { NotificationQueueUnreachableError } from '../../src/notification/domain/notification-queue.error.js'
import { createNotificationSchedulesRoutine } from '../../src/notification-schedules/application/notification-schedules.routine.js'
import type { SweepDueInvoicesResult } from '../../src/notification-schedules/application/sweep-due-invoices.use-case.js'
import {
  NOTIFICATION_SCHEDULES_FAILURE_CAUSES,
  NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES,
  toNotificationSchedulesFailureCause,
  toNotificationSchedulesOutcome,
} from '../../src/notification-schedules/domain/notification-schedules-failure.policy.js'
import { NOTIFICATION_SCHEDULES_JOB } from '../../src/notification-schedules/domain/notification-schedules.constant.js'
import { isJobOutcome, JOB_FAILURE_OUTCOMES } from '../../src/shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

import { createLoggerDouble, createManualScheduler, type LoggedMessage } from './job-run.double.js'

const NOW = new Date('2026-08-24T09:00:00.000Z')
const EXECUTION_ID = '9f0a1b2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c'
const CORRELATION_ID = 'tick-2026-08-24T09:00:00.000Z'

type ScheduleDouble = { readonly name: string; run(): Promise<void> }

function schedule(name: string, failure?: unknown): ScheduleDouble {
  return {
    name,
    run: async () => {
      if (failure !== undefined) throw failure
    },
  }
}

function templateMissingError(): Error {
  const error = new Error('template not found') as Error & { code: string }
  error.code = 'NOTIFICATION_TEMPLATE_NOT_FOUND'
  return error
}

type FixtureParams = {
  readonly schedules?: readonly ScheduleDouble[]
  readonly stopAfter?: number
  readonly sweep?: () => Promise<SweepDueInvoicesResult>
}

type RoutineFixture = {
  readonly logged: LoggedMessage[]
  readonly ran: string[]
  readonly run: () => Promise<{
    readonly counters: Readonly<Record<string, number>>
    readonly outcome: string
  }>
}

function createFixture({ schedules, stopAfter, sweep }: FixtureParams = {}): RoutineFixture {
  const logged: LoggedMessage[] = []
  const ran: string[] = []
  const declared = schedules ?? [schedule('notification:dispatch-due')]

  const routine = createNotificationSchedulesRoutine({
    logger: createLoggerDouble(logged),
    now: () => NOW,
    schedules: declared.map((entry) => ({
      name: entry.name,
      run: async () => {
        ran.push(entry.name)
        await entry.run()
      },
    })),
    sweep: sweep ?? (async () => ({ failures: [], notifiedCount: 0, sweptCount: 0 })),
  })

  const context: JobRoutineContext = {
    correlationId: CORRELATION_ID,
    executionId: EXECUTION_ID,
    isStopRequested: () => stopAfter !== undefined && ran.length >= stopAfter,
    job: NOTIFICATION_SCHEDULES_JOB,
    origin: 'schedule',
  }

  return { logged, ran, run: () => routine.run(context) }
}

describe('notification schedules failure vocabulary', () => {
  test('toda causa cai numa palavra do catálogo desta rotina, ou no pouso do imprevisto', () => {
    const allowed: readonly string[] = [
      ...JOB_FAILURE_OUTCOMES[NOTIFICATION_SCHEDULES_JOB],
      'unexpected_error',
    ]

    for (const cause of NOTIFICATION_SCHEDULES_FAILURE_CAUSES) {
      const outcome = toNotificationSchedulesOutcome(cause)
      expect(allowed).toContain(outcome)
      expect(isJobOutcome({ job: NOTIFICATION_SCHEDULES_JOB, outcome })).toBe(true)
    }
  })

  test('a classificação é pela causa tipada, não pela semelhança da mensagem', () => {
    expect(toNotificationSchedulesFailureCause(new NotificationQueueUnreachableError())).toBe(
      'queue_unreachable',
    )
    expect(toNotificationSchedulesFailureCause(templateMissingError())).toBe('template_missing')
    // Um erro que só *diz* "queue unreachable" continua sendo o imprevisto: mensagem não é contrato.
    expect(toNotificationSchedulesFailureCause(new Error('queue unreachable'))).toBe('unknown')
    expect(toNotificationSchedulesFailureCause('boom')).toBe('unknown')
  })

  test('a ordem de desempate põe o que o operador resolve antes do que o tempo resolve', () => {
    expect(NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES).toEqual([
      'template_missing',
      'queue_unreachable',
    ])
  })
})

describe('notification schedules routine', () => {
  test('ciclo limpo fecha em `succeeded`, e os contadores dizem o que correu', async () => {
    const fixture = createFixture({
      schedules: [schedule('notification:dispatch-due'), schedule('notification:purge-expired')],
      sweep: async () => ({ failures: [], notifiedCount: 2, sweptCount: 3 }),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({
      dueInvoices: 3,
      notified: 2,
      schedulesFailed: 0,
      schedulesRun: 2,
    })
    expect(fixture.ran).toEqual(['notification:dispatch-due', 'notification:purge-expired'])
  })

  test('rotina que cai não leva as seguintes junto', async () => {
    const fixture = createFixture({
      schedules: [
        schedule('notification:dispatch-due', new NotificationQueueUnreachableError()),
        schedule('notification:purge-expired'),
      ],
    })

    const result = await fixture.run()

    expect(fixture.ran).toEqual(['notification:dispatch-due', 'notification:purge-expired'])
    expect(result.outcome).toBe('queue_unreachable')
    expect(result.counters.schedulesFailed).toBe(1)
    expect(result.counters.queue_unreachable).toBe(1)
    expect(fixture.logged.map((entry) => entry.message)).toContain('notification_schedule_failed')
  })

  test('a falha da varredura fecha a linha pelo mesmo vocabulário das rotinas', async () => {
    const fixture = createFixture({
      sweep: async () => ({
        failures: ['template_missing'],
        notifiedCount: 0,
        sweptCount: 1,
      }),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('template_missing')
    expect(result.counters.template_missing).toBe(1)
  })

  test('causa fora do vocabulário fecha em `unexpected_error`, e a linha não fica aberta', async () => {
    const fixture = createFixture({
      schedules: [schedule('notification:dispatch-due', new Error('quem sabe'))],
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('unexpected_error')
    expect(result.counters.schedulesFailed).toBe(1)
  })

  test('o que o operador resolve vence o que o tempo resolve', async () => {
    const fixture = createFixture({
      schedules: [
        schedule('notification:dispatch-due', new NotificationQueueUnreachableError()),
        schedule('notification:purge-expired', templateMissingError()),
      ],
    })

    expect((await fixture.run()).outcome).toBe('template_missing')
  })

  test('parada pedida larga o que ainda não começou, e o ciclo fecha limpo', async () => {
    const fixture = createFixture({
      schedules: [schedule('notification:dispatch-due'), schedule('notification:purge-expired')],
      stopAfter: 1,
    })

    const result = await fixture.run()

    expect(fixture.ran).toEqual(['notification:dispatch-due'])
    expect(result.outcome).toBe('succeeded')
    expect(result.counters.schedulesRun).toBe(1)
  })
})

describe('notification schedules registration', () => {
  test('a rotina registrada fecha a linha com o código dela, não com `job_run_routine_missing`', async () => {
    const finishes: FinishJobExecutionParams[] = []
    const logged: LoggedMessage[] = []
    const claimed: ClaimedJobExecution = { job: NOTIFICATION_SCHEDULES_JOB, origin: 'schedule' }

    const executions: JobExecutionPort = {
      claim: async () => claimed,
      finish: async (params) => {
        finishes.push(params)
      },
      renew: async () => ({ cancelRequestedAt: undefined }),
    }

    const envelope: JobRunEnvelopeV1 = {
      correlationId: CORRELATION_ID,
      eventId: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
      occurredAt: '2026-08-24T09:00:00.000Z',
      payload: { executionId: EXECUTION_ID, job: NOTIFICATION_SCHEDULES_JOB, origin: 'schedule' },
      type: 'transportada.job.run.requested',
      version: 1,
    }

    const logger: WorkerLogger = createLoggerDouble(logged)

    const result = await runJobCycle({
      dependencies: {
        executions,
        logger,
        now: () => NOW,
        routines: {
          [NOTIFICATION_SCHEDULES_JOB]: createNotificationSchedulesRoutine({
            logger,
            now: () => NOW,
            schedules: [{ name: 'notification:dispatch-due', run: async () => undefined }],
            sweep: async () => ({ failures: [], notifiedCount: 1, sweptCount: 1 }),
          }),
        },
        scheduleInterval: createManualScheduler().scheduler,
      },
      envelope,
    })

    expect(result).toEqual({ claimed: true, outcome: 'succeeded' })
    expect(finishes).toEqual([
      {
        counters: { dueInvoices: 1, notified: 1, schedulesFailed: 0, schedulesRun: 1 },
        executionId: EXECUTION_ID,
        finishedAt: NOW,
        outcome: 'succeeded',
      },
    ])
    expect(logged.map((entry) => entry.message)).not.toContain('job_run_routine_missing')
  })
})
