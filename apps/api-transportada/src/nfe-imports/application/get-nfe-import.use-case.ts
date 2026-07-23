/** Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { nfeImportNotFound } from './nfe-import.error.js'
import type { NfeImportDetail, NfeImportDetailReaderPort } from './nfe-import.types.js'

export function createGetNfeImportUseCase(input: {
  readonly repository: NfeImportDetailReaderPort
}) {
  return {
    async execute(request: {
      readonly context: CompanyContext
      readonly importId: string
    }): Promise<NfeImportDetail> {
      const result = await input.repository.findById({
        companyId: request.context.companyId,
        importId: request.importId,
      })
      if (result === null) throw nfeImportNotFound()
      return result
    },
  }
}
