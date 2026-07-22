/** Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { nfeImportNotFound } from './nfe-import.error.js'
import type {
  CompensateNfeImportRepositoryPort,
  NfeImportSafeError,
  NfeImportSummary,
} from './nfe-import.types.js'

export function createCompensateNfeImportUseCase(input: {
  readonly repository: CompensateNfeImportRepositoryPort
}) {
  return {
    async execute(request: {
      readonly context: CompanyContext
      readonly error: NfeImportSafeError
      readonly importId: string
    }): Promise<NfeImportSummary> {
      const result = await input.repository.fail({
        companyId: request.context.companyId,
        error: request.error,
        importId: request.importId,
      })
      if (result === null) throw nfeImportNotFound()
      return result
    },
  }
}
