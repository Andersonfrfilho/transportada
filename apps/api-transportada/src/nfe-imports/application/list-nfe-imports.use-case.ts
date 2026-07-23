/** Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { NfeImportListPage, NfeImportListReaderPort } from './nfe-import.types.js'

export function createListNfeImportsUseCase(input: {
  readonly repository: NfeImportListReaderPort
}) {
  return {
    execute(request: {
      readonly context: CompanyContext
      readonly cursor: string | null
      readonly filters?: Parameters<NfeImportListReaderPort['list']>[0]['filters']
      readonly limit: number
    }): Promise<NfeImportListPage> {
      return input.repository.list({
        companyId: request.context.companyId,
        cursor: request.cursor,
        limit: request.limit,
        ...(request.filters === undefined ? {} : { filters: request.filters }),
      })
    },
  }
}
