/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Achado 2 da revisão da spec 164: `GET /trip-occurrences/:id/case/settlement` — sem ele a tela do
 * acerto abria sempre vazia, porque `PUT .../case/settlement` (T13) só grava. Passa-adiante fino, no
 * mesmo molde de `record-occurrence-settlement.use-case.ts` — a leitura em si vive em
 * `DrizzleOccurrenceSettlementRepository.findSettlement`. O formato do item é o mesmo que o `PUT`
 * aceita (`amount` como string, nunca float), com `reimbursedAt` a mais para a marca de ressarcido.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { OccurrenceSettlementItemInput } from '../domain/occurrence-settlement.policy.js'

export type OccurrenceSettlementItemView = OccurrenceSettlementItemInput & {
  readonly reimbursedAt: string | null
}

export type FindOccurrenceSettlementResult = {
  readonly items: readonly OccurrenceSettlementItemView[]
  readonly total: string
}

export type FindOccurrenceSettlementPort = {
  findSettlement(input: {
    readonly caseId: string
    readonly companyId: string
  }): Promise<FindOccurrenceSettlementResult>
}

export type FindOccurrenceSettlementUseCase = {
  find(input: {
    readonly caseId: string
    readonly context: CompanyContext
  }): Promise<FindOccurrenceSettlementResult>
}

export function createFindOccurrenceSettlementUseCase(dependencies: {
  readonly repository: FindOccurrenceSettlementPort
}): FindOccurrenceSettlementUseCase {
  return {
    async find({ caseId, context }) {
      return dependencies.repository.findSettlement({ caseId, companyId: context.companyId })
    },
  }
}
