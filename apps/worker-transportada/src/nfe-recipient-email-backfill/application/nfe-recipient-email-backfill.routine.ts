/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import { resolveRecipientEmail } from '../../nfe-imports/domain/recipient-email.policy.js'
import type { NfeXmlImporter } from '../../nfe-imports/infrastructure/nfe-xml-importer.gateway.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { NFE_RECIPIENT_EMAIL_BACKFILL_BATCH_SIZE } from '../domain/nfe-recipient-email-backfill.constant.js'
import type {
  NfeRecipientEmailBackfillRepository,
  NfeRecipientEmailPendingDocument,
  NfeRecipientEmailXmlReader,
} from './nfe-recipient-email-backfill.port.js'

export type NfeRecipientEmailBackfillDependencies = {
  readonly importer: NfeXmlImporter
  readonly logger: WorkerLogger
  readonly reader: NfeRecipientEmailXmlReader
  readonly repository: NfeRecipientEmailBackfillRepository
}

type DocumentOutcome = 'filled' | 'rejected' | 'without_email'

type Counters = {
  examined: number
  failed: number
  filled: number
  rejected: number
  withoutEmail: number
}

/**
 * Nota importada antes da coluna `recipient_email` só tem o endereço no XML original guardado. A
 * passada relê esse XML e preenche onde a coluna é nula; nota cujo XML não traz e-mail continua nula
 * e volta a ser lida a cada execução — por isso a rotina nasce pausada e roda quando o operador pede.
 */
export function createNfeRecipientEmailBackfillRoutine(
  dependencies: NfeRecipientEmailBackfillDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: NfeRecipientEmailBackfillDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const counters: Counters = { examined: 0, failed: 0, filled: 0, rejected: 0, withoutEmail: 0 }
  let cursor: string | undefined

  while (!context.isStopRequested()) {
    const batch = await dependencies.repository.listDocumentsWithoutRecipientEmail({
      cursor,
      limit: NFE_RECIPIENT_EMAIL_BACKFILL_BATCH_SIZE,
    })
    if (batch.length === 0) break

    const settled = await Promise.allSettled(
      batch.map((document) => processDocument({ dependencies, document })),
    )
    countSettled({ counters, settled })
    cursor = batch[batch.length - 1]?.documentId
  }

  /** Contagem, nunca endereço: o e-mail é PII e o log não é lugar dele. */
  safeLogInfo({
    logger: dependencies.logger,
    message: 'nfe_recipient_email_backfill_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      executionId: context.executionId,
    },
  })

  return { counters: { ...counters }, outcome: 'succeeded' }
}

async function processDocument(input: {
  readonly dependencies: NfeRecipientEmailBackfillDependencies
  readonly document: NfeRecipientEmailPendingDocument
}): Promise<DocumentOutcome> {
  const { dependencies, document } = input
  const xml = await dependencies.reader.readXml({
    bucket: document.bucket,
    key: document.objectKey,
  })
  const imported = await dependencies.importer.importXml({ xml })
  if (imported.kind === 'nfe-event') return 'without_email'

  const resolved = resolveRecipientEmail(imported.document.recipient?.email)
  if (resolved.wasRejected) return 'rejected'
  if (resolved.email === null) return 'without_email'

  await dependencies.repository.fillRecipientEmail({
    companyId: document.companyId,
    documentId: document.documentId,
    email: resolved.email,
  })
  return 'filled'
}

function countSettled(input: {
  readonly counters: Counters
  readonly settled: readonly PromiseSettledResult<DocumentOutcome>[]
}): void {
  for (const result of input.settled) {
    input.counters.examined += 1
    if (result.status === 'rejected') input.counters.failed += 1
    else if (result.value === 'filled') input.counters.filled += 1
    else if (result.value === 'rejected') input.counters.rejected += 1
    else input.counters.withoutEmail += 1
  }
}
