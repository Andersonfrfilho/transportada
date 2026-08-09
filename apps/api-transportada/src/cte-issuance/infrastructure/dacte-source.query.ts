/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull } from 'drizzle-orm'

import { cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments } from '../../database/cte-issuance.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import type {
  DacteSourceLookup,
  DacteSourcePort,
  DacteSourceQuery,
} from '../application/render-dacte.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const AUTHORIZED_DOCUMENT_STATUS = 'authorized'

/**
 * `leftJoin` de propósito: o item sem documento autorizado precisa chegar como linha para o caso
 * virar 422, e não se confundir com o 404 de item que não é da empresa.
 */
const AUTHORIZED_DOCUMENT_JOIN = and(
  eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
  eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
  eq(cteFiscalDocuments.status, AUTHORIZED_DOCUMENT_STATUS),
  isNull(cteFiscalDocuments.cancellationRequestedAt),
)

const XML_OBJECT_JOIN = and(
  eq(storedObjects.companyId, cteFiscalDocuments.companyId),
  eq(storedObjects.id, cteFiscalDocuments.xmlObjectId),
)

export function createDacteSource(database: Database): DacteSourcePort {
  return {
    async findAuthorizedDocument(query: DacteSourceQuery): Promise<DacteSourceLookup> {
      const [row] = await database
        .select({
          accessKey: cteFiscalDocuments.accessKey,
          bucket: storedObjects.bucket,
          objectKey: storedObjects.objectKey,
        })
        .from(cteBatchItems)
        .leftJoin(cteFiscalDocuments, AUTHORIZED_DOCUMENT_JOIN)
        .leftJoin(storedObjects, XML_OBJECT_JOIN)
        .where(
          and(
            eq(cteBatchItems.companyId, query.companyId),
            eq(cteBatchItems.batchId, query.batchId),
            eq(cteBatchItems.id, query.batchItemId),
          ),
        )
        .limit(1)

      if (row === undefined) return { kind: 'missing' }
      if (row.accessKey === null || row.bucket === null || row.objectKey === null) {
        return { kind: 'not-authorized' }
      }

      return {
        document: { accessKey: row.accessKey, bucket: row.bucket, objectKey: row.objectKey },
        kind: 'authorized',
      }
    },
  }
}
