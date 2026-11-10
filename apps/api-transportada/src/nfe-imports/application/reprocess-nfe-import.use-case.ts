/** Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { nfeImportNotFound, nfeImportReprocessNotAllowed } from './nfe-import.error.js'
import { planNfeImportReprocess } from './nfe-import-reprocess.policy.js'
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
  const plan = planNfeImportReprocess(detail)
  if (plan.busy) throw nfeImportReprocessNotAllowed()
  const items = plan.failedItems.map((item) => ({
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
  // Recusa reprocessável não ganha linha nova: o consumidor relê o item no lugar (spec 314).
  if (items.length === 0 && plan.rejectedItems.length === 0) throw nfeImportReprocessNotAllowed()
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
