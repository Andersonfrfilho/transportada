/** Copyright (c) 2026 Ada Technology. MIT License. */
import { nfeImportNotFound } from './nfe-import.error.js'
import type {
  FinalizeNfeImportRepositoryPort,
  NfeImportItem,
  NfeImportSummary,
} from './nfe-import.types.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

export function createFinalizeNfeImportUseCase(input: {
  readonly repository: FinalizeNfeImportRepositoryPort
}) {
  return {
    async execute(request: {
      readonly context: CompanyContext
      readonly importId: string
      readonly itemResults: readonly Pick<NfeImportItem, 'error' | 'id' | 'status'>[]
    }): Promise<NfeImportSummary> {
      const detail = await input.repository.findById({
        companyId: request.context.companyId,
        importId: request.importId,
      })
      if (detail === null) throw nfeImportNotFound()
      const count = (status: NfeImportItem['status']) =>
        BigInt(request.itemResults.filter((item) => item.status === status).length)
      const summary: NfeImportSummary = {
        ...detail,
        processedCount: BigInt(request.itemResults.length),
        importedCount: count('imported'),
        duplicatedCount: count('duplicated'),
        invalidCount: count('invalid'),
        rejectedCount: count('rejected'),
        failedCount: count('failed'),
        terminalError: null,
        status: request.itemResults.every(
          (item) => item.status === 'imported' || item.status === 'duplicated',
        )
          ? 'completed'
          : 'partially_processed',
        version: detail.version + 1n,
      }
      await input.repository.saveResult({
        companyId: request.context.companyId,
        importId: request.importId,
        items: request.itemResults,
        summary,
      })
      return summary
    },
  }
}
