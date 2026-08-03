/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  parseCteBatchItemFilters,
  parseJsonBody,
} from '../../cte-batches/presentation/cte-batch.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  CTE_EXPORT_MAX_DOCUMENTS,
  type CteExportFilters,
} from '../application/export-cte-documents.port.js'

const OPTIONAL_TEXT = z.string().optional()
const OPTIONAL_TEXT_LIST = z.array(z.string()).optional()

const exportFiltersSchema = z
  .object({
    batchId: OPTIONAL_TEXT,
    cteNumberGte: OPTIONAL_TEXT,
    cteNumberIn: OPTIONAL_TEXT_LIST,
    cteNumberLte: OPTIONAL_TEXT,
    invoiceNumberGte: OPTIONAL_TEXT,
    invoiceNumberIn: OPTIONAL_TEXT_LIST,
    invoiceNumberLte: OPTIONAL_TEXT,
    issuedFrom: OPTIONAL_TEXT,
    issuedUntil: OPTIONAL_TEXT,
    statusIn: OPTIONAL_TEXT_LIST,
  })
  .strict()

/** Sem `companyId`: a empresa é a do contexto autenticado, então o campo é chave desconhecida. */
const exportRequestSchema = z
  .object({
    filters: exportFiltersSchema.optional(),
    itemIds: z.array(z.uuid()).min(1).max(CTE_EXPORT_MAX_DOCUMENTS).optional(),
  })
  .strict()

export type CteExportRequestBody = {
  readonly filters?: CteExportFilters
  readonly itemIds?: readonly string[]
}

export async function parseCteExportRequest(request: Request): Promise<CteExportRequestBody> {
  const result = exportRequestSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  const filters =
    result.data.filters === undefined
      ? undefined
      : parseCteBatchItemFilters(toFilterReader(result.data.filters))
  const itemIds = result.data.itemIds

  return {
    ...(filters === undefined ? {} : { filters }),
    ...(itemIds === undefined ? {} : { itemIds }),
  }
}

/** A validação da listagem lê `string | null`; lista JSON vira o mesmo texto separado por vírgula. */
function toFilterReader(
  filters: Readonly<Record<string, string | readonly string[] | undefined>>,
): (key: string) => string | null {
  return (key) => {
    const value = filters[key]
    if (value === undefined) return null
    return Array.isArray(value) ? value.join(',') : (value as string)
  }
}
