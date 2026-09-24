/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T13: `PUT /trip-occurrences/:id/case/settlement`. O caso de uso é um passa-adiante fino —
 * toda a transação (lock da tratativa, validação de precondição, soma em `Decimal`, substituição da
 * lista e a ponte para `delivery_charges`, T17) vive em `DrizzleRecordOccurrenceSettlementRepository`,
 * no molde de `RedeliveryApplicationPort`/`DrizzleRedeliveryApplicationRepository` (T14b).
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { OccurrenceSettlementItemInput } from '../domain/occurrence-settlement.policy.js'

export type OccurrenceSettlementItemResult = OccurrenceSettlementItemInput

export type RecordOccurrenceSettlementResult = {
  readonly items: readonly OccurrenceSettlementItemResult[]
  readonly total: string
}

export type RecordOccurrenceSettlementPort = {
  recordSettlement(input: {
    readonly actorUserId: string
    readonly caseId: string
    readonly companyId: string
    readonly items: readonly OccurrenceSettlementItemInput[]
  }): Promise<RecordOccurrenceSettlementResult>
}

export type RecordOccurrenceSettlementUseCase = {
  record(input: {
    readonly caseId: string
    readonly context: CompanyContext
    readonly items: readonly OccurrenceSettlementItemInput[]
  }): Promise<RecordOccurrenceSettlementResult>
}

export function createRecordOccurrenceSettlementUseCase(dependencies: {
  readonly repository: RecordOccurrenceSettlementPort
}): RecordOccurrenceSettlementUseCase {
  return {
    async record({ caseId, context, items }) {
      return dependencies.repository.recordSettlement({
        actorUserId: context.userId,
        caseId,
        companyId: context.companyId,
        items,
      })
    },
  }
}
