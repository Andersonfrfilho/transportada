/** Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { nfeImportNotFound, nfeImportReprocessNotAllowed } from './nfe-import.error.js'
import type {
  NfeImportSummary,
  ReprocessNfeImportTransactionPort,
  ReprocessNfeImportUnitOfWorkPort,
} from './nfe-import.types.js'

export function createReprocessNfeImportUseCase(dependencies: {
  readonly unitOfWork: ReprocessNfeImportUnitOfWorkPort
}) {
  return {
    execute(request: {
      readonly context: CompanyContext
      readonly importId: string
    }): Promise<NfeImportSummary> {
      const operation = (transaction: ReprocessNfeImportTransactionPort) =>
        executeReprocess(transaction, request)
      return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
    },
  }
}

async function executeReprocess(
  transaction: ReprocessNfeImportTransactionPort,
  request: { readonly context: CompanyContext; readonly importId: string },
): Promise<NfeImportSummary> {
  const companyId = request.context.companyId
  const detail = await transaction.findById({ companyId, importId: request.importId })
  if (detail === null) throw nfeImportNotFound()
  if (detail.status !== 'failed' && detail.status !== 'partially_processed')
    throw nfeImportReprocessNotAllowed()
  const items = detail.items
    .filter((item) => item.status === 'failed')
    .map((item) => ({
      attempt: item.attempt + 1n,
      companyId,
      error: null,
      importId: detail.id,
      ordinal: item.ordinal,
      previousAttempt: item.attempt,
      previousItemId: item.id,
      sourceEntry: item.sourceEntry,
      sourceName: item.sourceName,
      sourceObjectId: item.sourceObjectId,
      sourceSha256: item.sourceSha256,
      status: 'pending' as const,
    }))
  if (items.length === 0) throw nfeImportReprocessNotAllowed()
  const result = await transaction.queueRetry({ companyId, importId: detail.id, items })
  await transaction.saveOutbox({
    actorUserId: request.context.userId,
    aggregateId: detail.id,
    aggregateType: 'nfe_import',
    companyId,
    correlationId: detail.correlationId,
    eventId: crypto.randomUUID(),
    eventType: 'transportada.nfe.import.requested',
    eventVersion: 1,
    payload: { importId: detail.id },
  })
  return result
}
