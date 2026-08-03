/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm'

import { cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments } from '../../database/cte-issuance.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import { buildCompanyItemFilters } from '../../cte-batches/infrastructure/drizzle-cte-batch-item.repository.js'
import type {
  CteExportDocument,
  CteExportFilters,
  CteExportSelectionPort,
  CteExportSelectionQuery,
} from '../application/export-cte-documents.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type CteExportFilterInput = {
  readonly companyId: string
  readonly filters?: CteExportFilters | undefined
  readonly itemIds?: readonly string[] | undefined
}

const AUTHORIZED_DOCUMENT_STATUS = 'authorized'

const XML_OBJECT_JOIN = and(
  eq(storedObjects.companyId, cteFiscalDocuments.companyId),
  eq(storedObjects.id, cteFiscalDocuments.xmlObjectId),
)

const ISSUED_DOCUMENT_JOIN = and(
  eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
  eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
)

/**
 * Reaproveita os filtros da listagem e estreita para o que é exportável: documento autorizado e não
 * cancelado. A chave de acesso e o objeto do XML vêm dos `innerJoin`, colunas `not null` na origem.
 */
export function buildCteExportFilters(input: CteExportFilterInput): SQL[] {
  const conditions = buildCompanyItemFilters({
    companyId: input.companyId,
    cursor: null,
    filters: input.filters,
  })
  conditions.push(
    eq(cteFiscalDocuments.status, AUTHORIZED_DOCUMENT_STATUS),
    isNull(cteFiscalDocuments.cancellationRequestedAt),
  )
  if (input.itemIds !== undefined) {
    conditions.push(inArray(cteBatchItems.id, [...input.itemIds]))
  }

  return conditions
}

export function createCteExportSelection(database: Database): CteExportSelectionPort {
  return {
    async listAuthorizedDocuments(
      query: CteExportSelectionQuery,
    ): Promise<readonly CteExportDocument[]> {
      return database
        .select({
          accessKey: cteFiscalDocuments.accessKey,
          bucket: storedObjects.bucket,
          objectKey: storedObjects.objectKey,
        })
        .from(cteBatchItems)
        .innerJoin(cteFiscalDocuments, ISSUED_DOCUMENT_JOIN)
        .innerJoin(storedObjects, XML_OBJECT_JOIN)
        .where(
          and(
            ...buildCteExportFilters({
              companyId: query.companyId,
              filters: query.filters,
              itemIds: query.itemIds,
            }),
          ),
        )
        .orderBy(cteFiscalDocuments.accessKey)
        .limit(query.limit)
    },
  }
}
