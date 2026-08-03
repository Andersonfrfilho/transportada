/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CompanyCteItemPage,
  CteBatchItemReaderPort,
  ListCompanyCteItemsInput,
} from './cte-batch-item.port.js'

/** Listagem que atravessa lotes: a empresa vem do contexto autenticado, nunca do filtro. */
export function createListCompanyCteItemsUseCase(dependencies: {
  readonly reader: CteBatchItemReaderPort
}): {
  execute(input: ListCompanyCteItemsInput): Promise<CompanyCteItemPage>
} {
  return {
    async execute(input: ListCompanyCteItemsInput): Promise<CompanyCteItemPage> {
      return dependencies.reader.listCompanyItems({
        companyId: input.context.companyId,
        cursor: input.cursor,
        limit: input.limit,
        ...(input.filters === undefined ? {} : { filters: input.filters }),
      })
    },
  }
}
