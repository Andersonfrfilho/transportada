/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { ErrorTracker } from '../../observability/sentry.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  DRIVER_STOP_REMINDER_BATCH_SIZE,
  DRIVER_STOP_REMINDER_MAX_PER_CYCLE,
} from '../domain/driver-stop-reminder.constant.js'
import { DriverStopReminderApiError } from './driver-stop-reminder-api.error.js'
import type { DriverStopReminderApiPort } from './driver-stop-reminder-api.port.js'
import type {
  DriverStopReminderQueuePort,
  DueDriverStopReminder,
} from './driver-stop-reminder-queue.port.js'

export type DriverStopReminderRoutineDependencies = {
  /** `DRIVER_REMINDERS_ENABLED`: desligado, o ciclo fecha `succeeded` sem ler nada. */
  readonly enabled: boolean
  readonly errorTracker: Pick<ErrorTracker, 'captureException'>
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly queue: DriverStopReminderQueuePort
  readonly reminderApi: DriverStopReminderApiPort
}

type Counters = Record<
  | 'apiUnauthorized'
  | 'apiUnreachable'
  | 'closed'
  | 'deferred'
  | 'escalated'
  | 'reconciliationFailures'
  | 'remindersReconciled'
  | 'remindersSeen'
  | 'requestRejected'
  | 'sent'
  | 'unexpectedErrors',
  number
>

type CycleOutcome = 'api_unreachable' | 'succeeded'

function createCounters(): Counters {
  return {
    apiUnauthorized: 0,
    apiUnreachable: 0,
    closed: 0,
    deferred: 0,
    escalated: 0,
    reconciliationFailures: 0,
    remindersReconciled: 0,
    remindersSeen: 0,
    requestRejected: 0,
    sent: 0,
    unexpectedErrors: 0,
  }
}

/** A decisão (horário, canal, escalada) é da API; o worker é só o relógio que entrega o que venceu. */
export function createDriverStopReminderRoutine(
  dependencies: DriverStopReminderRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: DriverStopReminderRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const counters = createCounters()
  const seenReminderIds: string[] = []
  let outcome: CycleOutcome = 'succeeded'

  if (dependencies.enabled) await reconcileActiveTrips({ context, counters, dependencies })

  while (
    dependencies.enabled &&
    outcome === 'succeeded' &&
    seenReminderIds.length < DRIVER_STOP_REMINDER_MAX_PER_CYCLE &&
    !context.isStopRequested()
  ) {
    const limit = Math.min(
      DRIVER_STOP_REMINDER_BATCH_SIZE,
      DRIVER_STOP_REMINDER_MAX_PER_CYCLE - seenReminderIds.length,
    )
    const batch = await dependencies.queue.listDue({
      excludeReminderIds: [...seenReminderIds],
      limit,
      now: dependencies.now(),
    })

    for (const reminder of batch) {
      if (context.isStopRequested()) break
      seenReminderIds.push(reminder.reminderId)
      counters.remindersSeen += 1
      const failure = await deliverOne({ counters, dependencies, reminder })
      if (failure !== undefined) {
        outcome = failure
        break
      }
    }

    if (batch.length < limit) break
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'driver_stop_reminder_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      enabled: dependencies.enabled,
      executionId: context.executionId,
      exhausted: seenReminderIds.length >= DRIVER_STOP_REMINDER_MAX_PER_CYCLE,
    },
  })

  return { counters, outcome }
}

/**
 * O lembrete segue a viagem ativa (dono, 2026-11-07): antes de entregar, cada empresa com a chave ligada pede à API
 * que garanta a etapa atual. Falha aqui nunca segura a entrega do que já venceu.
 */
async function reconcileActiveTrips(input: {
  readonly context: JobRoutineContext
  readonly counters: Counters
  readonly dependencies: DriverStopReminderRoutineDependencies
}): Promise<void> {
  const { context, counters, dependencies } = input
  try {
    const companyIds = await dependencies.queue.listReconcilableCompanyIds()
    for (const companyId of companyIds) {
      if (context.isStopRequested()) return
      try {
        const { openedCount } = await dependencies.reminderApi.reconcile({ companyId })
        counters.remindersReconciled += openedCount
      } catch (error) {
        counters.reconciliationFailures += 1
        dependencies.errorTracker.captureException(error)
      }
    }
  } catch (error) {
    counters.reconciliationFailures += 1
    dependencies.errorTracker.captureException(error)
  }
}

async function deliverOne(input: {
  readonly counters: Counters
  readonly dependencies: DriverStopReminderRoutineDependencies
  readonly reminder: DueDriverStopReminder
}): Promise<'api_unreachable' | undefined> {
  const { counters, dependencies, reminder } = input
  try {
    const { outcome } = await dependencies.reminderApi.deliver(reminder)
    counters[outcome] += 1
    return undefined
  } catch (error) {
    if (!(error instanceof DriverStopReminderApiError)) {
      counters.unexpectedErrors += 1
      dependencies.errorTracker.captureException(error)
      return undefined
    }
    if (error.outcome === 'request_rejected') {
      counters.requestRejected += 1
      return undefined
    }
    if (error.outcome === 'api_unauthorized') {
      counters.apiUnauthorized += 1
      dependencies.errorTracker.captureException(error)
    } else {
      counters.apiUnreachable += 1
    }
    return 'api_unreachable'
  }
}
