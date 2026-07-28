/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import type {
  CteBatchItemReaderPort,
  ListCteBatchItemsInput,
  ListCteBatchItemsResult,
} from './cte-batch-item.port.js'

export function createListCteBatchItemsUseCase(dependencies: {
  readonly reader: CteBatchItemReaderPort
}): {
  execute(input: ListCteBatchItemsInput): Promise<ListCteBatchItemsResult>
} {
  return {
    async execute(input: ListCteBatchItemsInput): Promise<ListCteBatchItemsResult> {
      const query = { batchId: input.batchId, companyId: input.context.companyId }
      const batch = await dependencies.reader.findBatch(query)
      if (batch === null) throw createBatchNotFoundError()

      return { items: await dependencies.reader.listItems(query) }
    },
  }
}

function createBatchNotFoundError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_NOT_FOUND',
    message: 'CT-e batch was not found',
    status: 404,
  })
}
