/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O vínculo ativo de uma nota com um lote de CT-e: a linha de `cte_batch_item_documents` da empresa
 * cujo lote não foi cancelado. A listagem de notas e o relatório de viagens leem o mesmo recorte.
 */
import { eq, ne, type SQL } from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'

export const CANCELLED_BATCH_STATUS = 'cancelled'

export function buildBatchLinkCompanyFilter(companyId: string): SQL {
  return eq(cteBatchItemDocuments.companyId, companyId)
}

export function buildBatchLinkNotCancelledFilter(): SQL {
  return ne(cteBatches.status, CANCELLED_BATCH_STATUS)
}
