/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T18 (RF31/CA9e): `POST /trip-occurrences/:id/case/settlement/reimbursement`. Passa-adiante
 * fino, no mesmo molde de `record-occurrence-settlement.use-case.ts` — a transação (lock por
 * `(companyId, caseId, productCode)`, recusa de `payer_kind = 'carrier'`, idempotência) vive em
 * `DrizzleOccurrenceSettlementRepository`.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

export type ReimburseOccurrenceSettlementResult = {
  readonly kind: 'changed' | 'unchanged'
}

export type ReimburseOccurrenceSettlementPort = {
  reimburseSettlementItem(input: {
    readonly actorUserId: string
    readonly caseId: string
    readonly companyId: string
    readonly productCode: string
  }): Promise<ReimburseOccurrenceSettlementResult>
}

export type ReimburseOccurrenceSettlementUseCase = {
  reimburse(input: {
    readonly caseId: string
    readonly context: CompanyContext
    readonly productCode: string
  }): Promise<ReimburseOccurrenceSettlementResult>
}

export function createReimburseOccurrenceSettlementUseCase(dependencies: {
  readonly repository: ReimburseOccurrenceSettlementPort
}): ReimburseOccurrenceSettlementUseCase {
  return {
    async reimburse({ caseId, context, productCode }) {
      return dependencies.repository.reimburseSettlementItem({
        actorUserId: context.userId,
        caseId,
        companyId: context.companyId,
        productCode,
      })
    },
  }
}
