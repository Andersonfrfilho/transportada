/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { idempotencyKeyReused } from './nfe-import.error.js'
import type {
  IdempotencyFingerprintPort,
  NfeImportItemDraft,
  RequestNfeImportInput,
  RequestNfeImportTransactionPort,
  RequestNfeImportUnitOfWorkPort,
  NfeImportSummary,
} from './nfe-import.types.js'

const OPERATION = 'nfe-import.request'
const ENCODER = new TextEncoder()

/**
 * A busca remota pedida pelo botão é a rotina `nfe.distribution.pull` disparada antes da hora — e
 * por isso ela deixa a mesma linha de histórico que a janela deixa, diferente só na origem. A linha
 * já nasce fechada: o que a API faz aqui é enfileirar, e enfileirar terminou quando a transação
 * comitou. Quem fica em aberto é a importação, que tem trilha própria.
 */
const DISTRIBUTION_JOB = 'nfe.distribution.pull'

const REQUEST_EVENT_TYPE = {
  distribution: 'transportada.nfe.distribution.requested',
  upload: 'transportada.nfe.import.requested',
} as const

export function createRequestNfeImportUseCase(dependencies: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly unitOfWork: RequestNfeImportUnitOfWorkPort
}) {
  return {
    execute: (request: RequestNfeImportInput): Promise<NfeImportSummary> => {
      const operation = (transaction: RequestNfeImportTransactionPort) =>
        executeRequest(transaction, dependencies.fingerprintService, request)
      return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
    },
  }
}

async function executeRequest(
  transaction: RequestNfeImportTransactionPort,
  fingerprints: IdempotencyFingerprintPort,
  request: RequestNfeImportInput,
): Promise<NfeImportSummary> {
  const companyId = request.context.companyId
  const fingerprint = await fingerprints.create({
    fields: [
      companyId,
      request.source,
      ...request.stagedSources.flatMap((source) => [
        source.objectId,
        source.sha256,
        source.sourceEntry,
      ]),
    ].map((value) => ENCODER.encode(value)),
    operation: OPERATION,
  })
  const replay = await transaction.findIdempotency({
    companyId,
    idempotencyKey: request.idempotencyKey,
    operation: OPERATION,
  })
  if (replay !== null) {
    if (replay.fingerprint !== fingerprint) throw idempotencyKeyReused()
    return replay.response
  }
  transaction.setRequestFingerprint?.(fingerprint)
  const summary = await transaction.createImport({
    companyId,
    correlationId: request.correlationId,
    duplicatedCount: 0n,
    failedCount: 0n,
    ...(request.importId === undefined ? {} : { id: request.importId }),
    idempotencyKey: request.idempotencyKey,
    importedCount: 0n,
    invalidCount: 0n,
    processedCount: 0n,
    receivedCount: BigInt(request.stagedSources.length),
    rejectedCount: 0n,
    requestedByUserId: request.context.userId,
    source: request.source,
    status: 'queued',
    terminalError: null,
  })
  const items: NfeImportItemDraft[] = request.stagedSources.map((source, index) => ({
    attempt: 1n,
    companyId,
    error: null,
    importId: summary.id,
    ordinal: BigInt(index + 1),
    previousAttempt: null,
    previousItemId: null,
    sourceEntry: source.sourceEntry,
    sourceName: source.sourceName,
    sourceObjectId: source.objectId,
    sourceSha256: source.sha256,
    status: 'pending',
  }))
  await transaction.createItems({ importId: summary.id, items })
  await transaction.saveIdempotency({
    companyId,
    fingerprint,
    idempotencyKey: request.idempotencyKey,
    operation: OPERATION,
    response: summary,
  })
  await transaction.saveOutbox({
    actorUserId: request.context.userId,
    aggregateId: summary.id,
    aggregateType: 'nfe_import',
    companyId,
    correlationId: request.correlationId,
    eventId: crypto.randomUUID(),
    eventType: REQUEST_EVENT_TYPE[request.source],
    eventVersion: 1,
    payload: { importId: summary.id },
  })
  if (request.source === 'distribution') {
    await transaction.recordManualJobRun?.({
      companyId,
      correlationId: request.correlationId,
      counters: { enqueuedImports: 1 },
      job: DISTRIBUTION_JOB,
      outcome: 'succeeded',
      requestedBy: request.context.userId,
    })
  }
  return summary
}
