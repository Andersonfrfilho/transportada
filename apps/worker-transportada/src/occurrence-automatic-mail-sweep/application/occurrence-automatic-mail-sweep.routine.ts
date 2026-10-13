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
  OCCURRENCE_AUTOMATIC_MAIL_BATCH_SIZE,
  OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS,
  OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS,
  OCCURRENCE_AUTOMATIC_MAIL_MAX_PER_CYCLE,
} from '../domain/occurrence-automatic-mail-sweep.constant.js'
import { OccurrenceAutomaticMailApiError } from './occurrence-automatic-mail-api.error.js'
import type { OccurrenceAutomaticMailApiPort } from './occurrence-automatic-mail-api.port.js'
import type { OccurrenceAutomaticMailQueuePort } from './occurrence-automatic-mail-queue.port.js'

export type OccurrenceAutomaticMailSweepDependencies = {
  readonly errorTracker: Pick<ErrorTracker, 'captureException'>
  readonly logger: WorkerLogger
  readonly mailApi: OccurrenceAutomaticMailApiPort
  readonly now: () => Date
  readonly queue: OccurrenceAutomaticMailQueuePort
}

type Counters = Record<
  | 'alreadySent'
  | 'apiUnauthorized'
  | 'apiUnreachable'
  | 'occurrencesSeen'
  | 'requestRejected'
  | 'sent'
  | 'skipped'
  | 'unexpectedErrors',
  number
>

type CycleOutcome = 'api_unauthorized' | 'api_unreachable' | 'succeeded'

function createCounters(): Counters {
  return {
    alreadySent: 0,
    apiUnauthorized: 0,
    apiUnreachable: 0,
    occurrencesSeen: 0,
    requestRejected: 0,
    sent: 0,
    skipped: 0,
    unexpectedErrors: 0,
  }
}

/**
 * Rede de segurança do aviso automático: o caminho em linha (app e WhatsApp) é o normal, e este
 * varredor só envia o que ele deixou para trás. Duplicar é impossível — a API responde pela chave de
 * idempotência da ocorrência, e a fila já exclui quem tem registro.
 */
export function createOccurrenceAutomaticMailSweepRoutine(
  dependencies: OccurrenceAutomaticMailSweepDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: OccurrenceAutomaticMailSweepDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const counters = createCounters()
  const seenOccurrenceIds: string[] = []
  const nowMilliseconds = dependencies.now().getTime()
  const window = {
    createdAfter: new Date(nowMilliseconds - OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS),
    createdBefore: new Date(nowMilliseconds - OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS),
  }
  let outcome: CycleOutcome = 'succeeded'

  while (
    outcome === 'succeeded' &&
    seenOccurrenceIds.length < OCCURRENCE_AUTOMATIC_MAIL_MAX_PER_CYCLE &&
    !context.isStopRequested()
  ) {
    const limit = Math.min(
      OCCURRENCE_AUTOMATIC_MAIL_BATCH_SIZE,
      OCCURRENCE_AUTOMATIC_MAIL_MAX_PER_CYCLE - seenOccurrenceIds.length,
    )
    const batch = await dependencies.queue.listPending({
      ...window,
      excludeOccurrenceIds: [...seenOccurrenceIds],
      limit,
    })

    for (const occurrence of batch) {
      if (context.isStopRequested()) break
      seenOccurrenceIds.push(occurrence.occurrenceId)
      counters.occurrencesSeen += 1
      const failure = await sendOne({ counters, dependencies, occurrence })
      if (failure !== undefined) {
        outcome = failure
        break
      }
    }

    if (batch.length < limit) break
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'occurrence_automatic_mail_sweep_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      executionId: context.executionId,
      exhausted: seenOccurrenceIds.length >= OCCURRENCE_AUTOMATIC_MAIL_MAX_PER_CYCLE,
    },
  })

  return { counters, outcome }
}

async function sendOne(input: {
  readonly counters: Counters
  readonly dependencies: OccurrenceAutomaticMailSweepDependencies
  readonly occurrence: { readonly companyId: string; readonly occurrenceId: string }
}): Promise<'api_unauthorized' | 'api_unreachable' | undefined> {
  const { counters, dependencies, occurrence } = input
  try {
    const { outcome } = await dependencies.mailApi.send(occurrence)
    if (outcome === 'sent') counters.sent += 1
    else if (outcome === 'already_sent') counters.alreadySent += 1
    else counters.skipped += 1
    return undefined
  } catch (error) {
    if (!(error instanceof OccurrenceAutomaticMailApiError)) {
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
      return 'api_unauthorized'
    }
    counters.apiUnreachable += 1
    return 'api_unreachable'
  }
}
