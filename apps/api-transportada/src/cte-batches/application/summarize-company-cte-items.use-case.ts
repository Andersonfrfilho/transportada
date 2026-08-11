/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CompanyCteItemSummary,
  CteBatchItemReaderPort,
  SummarizeCompanyCteItemsInput,
} from './cte-batch-item.port.js'

/** Resumo do recorte inteiro: a empresa vem do contexto autenticado, nunca do filtro. */
export function createSummarizeCompanyCteItemsUseCase(dependencies: {
  readonly reader: CteBatchItemReaderPort
}): {
  execute(input: SummarizeCompanyCteItemsInput): Promise<CompanyCteItemSummary>
} {
  return {
    async execute(input: SummarizeCompanyCteItemsInput): Promise<CompanyCteItemSummary> {
      return dependencies.reader.summarizeCompanyItems({
        companyId: input.context.companyId,
        ...(input.filters === undefined ? {} : { filters: input.filters }),
      })
    },
  }
}
