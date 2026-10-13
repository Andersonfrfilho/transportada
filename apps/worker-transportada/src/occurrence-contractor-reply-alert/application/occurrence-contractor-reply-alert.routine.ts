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
  OCCURRENCE_CONTRACTOR_REPLY_ALERT_BATCH_SIZE,
  OCCURRENCE_CONTRACTOR_REPLY_ALERT_MAX_PER_CYCLE,
} from '../domain/occurrence-contractor-reply-alert.constant.js'
import type {
  ContractorReplyAlertNotifierPort,
  ContractorReplyAlertRecipient,
  DueContractorReply,
  OccurrenceContractorReplyAlertQueuePort,
  OccurrenceContractorReplyAlertStorePort,
} from './occurrence-contractor-reply-alert.port.js'

export type OccurrenceContractorReplyAlertDependencies = {
  readonly errorTracker: Pick<ErrorTracker, 'captureException'>
  readonly logger: WorkerLogger
  readonly notifier: ContractorReplyAlertNotifierPort
  readonly now: () => Date
  readonly queue: OccurrenceContractorReplyAlertQueuePort
  readonly store: OccurrenceContractorReplyAlertStorePort
}

type Counters = Record<
  | 'alerted'
  | 'becameOverdue'
  | 'notificationFailures'
  | 'notified'
  | 'repliesSeen'
  | 'skipped'
  | 'unexpectedErrors'
  | 'withoutRecipient',
  number
>

function createCounters(): Counters {
  return {
    alerted: 0,
    becameOverdue: 0,
    notificationFailures: 0,
    notified: 0,
    repliesSeen: 0,
    skipped: 0,
    unexpectedErrors: 0,
    withoutRecipient: 0,
  }
}

/**
 * O alarme do retorno vencido da contratante (spec 248 RF5). A transição é condicional por `alert_count`
 * dentro da transação do repositório, então duas batidas ao mesmo tempo, ou o job em dobro, alertam uma
 * vez só; o aviso no sino ainda leva a chave `reply:<id>:<n>`, que o módulo de notificações deduplica.
 *
 * O aviso sai depois do commit e não decide o destino do alerta: o alerta já foi contado e gravado, e uma
 * falha de entrega fecha o ciclo como `notification_failed` em vez de refazer a transição.
 */
export function createOccurrenceContractorReplyAlertRoutine(
  dependencies: OccurrenceContractorReplyAlertDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: OccurrenceContractorReplyAlertDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const counters = createCounters()
  const seenReplyIds: string[] = []
  const now = dependencies.now()

  while (
    seenReplyIds.length < OCCURRENCE_CONTRACTOR_REPLY_ALERT_MAX_PER_CYCLE &&
    !context.isStopRequested()
  ) {
    const limit = Math.min(
      OCCURRENCE_CONTRACTOR_REPLY_ALERT_BATCH_SIZE,
      OCCURRENCE_CONTRACTOR_REPLY_ALERT_MAX_PER_CYCLE - seenReplyIds.length,
    )
    const batch = await dependencies.queue.listDue({
      excludeReplyIds: [...seenReplyIds],
      limit,
      now,
    })

    for (const reply of batch) {
      if (context.isStopRequested()) break
      seenReplyIds.push(reply.replyId)
      counters.repliesSeen += 1
      await alertOne({ counters, dependencies, now, reply })
    }

    if (batch.length < limit) break
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'occurrence_contractor_reply_alert_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      executionId: context.executionId,
      exhausted: seenReplyIds.length >= OCCURRENCE_CONTRACTOR_REPLY_ALERT_MAX_PER_CYCLE,
    },
  })

  return {
    counters,
    outcome: counters.notificationFailures > 0 ? 'notification_failed' : 'succeeded',
  }
}

async function alertOne(input: {
  readonly counters: Counters
  readonly dependencies: OccurrenceContractorReplyAlertDependencies
  readonly now: Date
  readonly reply: DueContractorReply
}): Promise<void> {
  const { counters, dependencies, now, reply } = input
  try {
    const result = await dependencies.store.applyAlert({
      companyId: reply.companyId,
      now,
      replyId: reply.replyId,
    })
    if (result.kind === 'skipped') {
      counters.skipped += 1
      return
    }

    counters.alerted += 1
    if (result.becomesOverdue) counters.becameOverdue += 1
    if (result.recipient === null) {
      counters.withoutRecipient += 1
      return
    }
    await notify({ ...input, alertNumber: result.alertNumber, recipient: result.recipient })
  } catch (error) {
    counters.unexpectedErrors += 1
    dependencies.errorTracker.captureException(error)
  }
}

async function notify(input: {
  readonly alertNumber: number
  readonly counters: Counters
  readonly dependencies: OccurrenceContractorReplyAlertDependencies
  readonly recipient: ContractorReplyAlertRecipient
  readonly reply: DueContractorReply
}): Promise<void> {
  const { alertNumber, counters, dependencies, recipient, reply } = input
  try {
    await dependencies.notifier.notify({
      alertNumber,
      companyId: reply.companyId,
      recipient,
      replyId: reply.replyId,
    })
    counters.notified += 1
  } catch (error) {
    counters.notificationFailures += 1
    dependencies.errorTracker.captureException(error)
  }
}
