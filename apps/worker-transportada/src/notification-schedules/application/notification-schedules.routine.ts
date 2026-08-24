/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES,
  toNotificationSchedulesFailureCause,
  type NotificationSchedulesFailureCause,
} from '../domain/notification-schedules-failure.policy.js'

import type { SweepDueInvoices } from './sweep-due-invoices.use-case.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'
const UNEXPECTED_OUTCOME: JobOutcome = 'unexpected_error'

/** Só o que o ciclo usa do módulo de notificação: um nome para o log e algo para correr. */
export type NotificationScheduleRunner = {
  readonly name: string
  run(): Promise<void>
}

export type NotificationSchedulesRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly schedules: readonly NotificationScheduleRunner[]
  readonly sweep: SweepDueInvoices
}

type CycleTally = {
  readonly causes: NotificationSchedulesFailureCause[]
  failedCount: number
  ranCount: number
}

/**
 * O ciclo tem duas metades: varrer o que venceu no faturamento e correr **todas** as rotinas do
 * módulo de notificação uma vez, em vez de interpretar o `cronExpression` que elas declaram — quem
 * agenda é o relógio no banco. As duas são idempotentes, então repetir não duplica aviso.
 *
 * Uma rotina que cai não interrompe as seguintes: elas são assuntos independentes, e deixar de
 * purgar o que expirou porque o despacho caiu seria reter conteúdo endereçado a uma pessoa por
 * causa de um erro em outro lugar.
 */
export function createNotificationSchedulesRoutine(
  dependencies: NotificationSchedulesRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

type RunCycleParams = {
  readonly context: JobRoutineContext
  readonly dependencies: NotificationSchedulesRoutineDependencies
}

async function runCycle({ context, dependencies }: RunCycleParams): Promise<JobRoutineResult> {
  const swept = await dependencies.sweep({ now: dependencies.now() })

  const tally: CycleTally = { causes: [...swept.failures], failedCount: 0, ranCount: 0 }

  for (const schedule of dependencies.schedules) {
    if (context.isStopRequested()) break
    await runSchedule({ context, dependencies, schedule, tally })
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'notification_schedules_cycle_finished',
    metadata: {
      correlationId: context.correlationId,
      dueInvoices: swept.sweptCount,
      executionId: context.executionId,
      notified: swept.notifiedCount,
      schedulesFailed: tally.failedCount,
      schedulesRun: tally.ranCount,
    },
  })

  return {
    counters: buildCounters({ swept, tally }),
    outcome: resolveOutcome(tally),
  }
}

type RunScheduleParams = {
  readonly context: JobRoutineContext
  readonly dependencies: NotificationSchedulesRoutineDependencies
  readonly schedule: NotificationScheduleRunner
  readonly tally: CycleTally
}

async function runSchedule({
  context,
  dependencies,
  schedule,
  tally,
}: RunScheduleParams): Promise<void> {
  try {
    await schedule.run()
    tally.ranCount += 1
  } catch (error: unknown) {
    tally.failedCount += 1
    tally.causes.push(toNotificationSchedulesFailureCause(error))
    safeLogError({
      logger: dependencies.logger,
      message: 'notification_schedule_failed',
      metadata: {
        correlationId: context.correlationId,
        executionId: context.executionId,
        reason: error instanceof Error ? error.name : 'UnknownError',
        schedule: schedule.name,
      },
    })
  }
}

type BuildCountersParams = {
  readonly swept: { readonly notifiedCount: number; readonly sweptCount: number }
  readonly tally: CycleTally
}

function buildCounters({ swept, tally }: BuildCountersParams): Readonly<Record<string, number>> {
  const counters: Record<string, number> = {
    dueInvoices: swept.sweptCount,
    notified: swept.notifiedCount,
    schedulesFailed: tally.failedCount,
    schedulesRun: tally.ranCount,
  }

  for (const outcome of NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES) {
    const count = tally.causes.filter((cause) => cause === outcome).length
    if (count > 0) counters[outcome] = count
  }

  return counters
}

/**
 * Aqui a falha manda, ao contrário da reconciliação fiscal: o trabalho do ciclo **é** avisar, e um
 * ciclo que avisou metade precisa aparecer no cartão como o que ele foi. O desempate entre causas é
 * a ordem de declaração de `NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES`, e a causa sem nome pousa em
 * `unexpected_error` — só depois das nomeadas, que dizem mais ao operador.
 */
function resolveOutcome(tally: CycleTally): JobOutcome {
  for (const outcome of NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES) {
    if (tally.causes.includes(outcome)) return outcome
  }

  return tally.causes.length > 0 ? UNEXPECTED_OUTCOME : COMPLETED_OUTCOME
}
