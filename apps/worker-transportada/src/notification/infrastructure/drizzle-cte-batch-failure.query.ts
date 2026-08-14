/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, count, eq, inArray } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cteBatches, cteIssuanceAttempts } from '../../database/cte-issuance-execution.schema.js'
import {
  CTE_ISSUANCE_ITEM_STATUSES,
  isSettledCteIssuanceStatus,
} from '../../cte-issuance/domain/cte-batch-progress.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Liquidado sem autorização — é o que o aviso conta, e o que a tela do lote detalha. */
const FAILED_STATUSES = CTE_ISSUANCE_ITEM_STATUSES.filter(
  (status) => isSettledCteIssuanceStatus(status) && status !== 'authorized',
)

export type CteBatchFailureSummary = {
  readonly batchName: string
  readonly failedCount: number
  readonly operatorUserId: string
}

export function createCteBatchFailureQuery(database: Database) {
  return async function loadCteBatchFailure(input: {
    readonly batchId: string
    readonly companyId: string
  }): Promise<CteBatchFailureSummary | undefined> {
    const scope = and(eq(cteBatches.companyId, input.companyId), eq(cteBatches.id, input.batchId))

    const [batch] = await database
      .select({ name: cteBatches.name, operatorUserId: cteBatches.operatorUserId })
      .from(cteBatches)
      .where(scope)
      .limit(1)

    if (batch === undefined) {
      return undefined
    }

    const [failed] = await database
      .select({ total: count() })
      .from(cteIssuanceAttempts)
      .where(
        and(
          eq(cteIssuanceAttempts.companyId, input.companyId),
          eq(cteIssuanceAttempts.batchId, input.batchId),
          inArray(cteIssuanceAttempts.status, FAILED_STATUSES),
        ),
      )

    return {
      batchName: batch.name,
      failedCount: failed?.total ?? 0,
      operatorUserId: batch.operatorUserId,
    }
  }
}
