/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 (ADR-0107, D3/D4/D6): a regra pura do escopo de contratantes do tipo de ocorrência. É a
 * mesma na lista (o que se oferece) e no registro (o que se aceita).
 */
import {
  OCCURRENCE_MOMENT,
  OCCURRENCE_TYPE_CONTRACTOR_SCOPE,
  type OccurrenceMoment,
  type OccurrenceTypeContractorScope,
} from '../../shared/trip-occurrence.constant.js'
import {
  OccurrenceTypeContractorScopeEmptyError,
  OccurrenceTypeContractorScopeInvalidError,
  OccurrenceTypeContractorScopeNeedsDocumentError,
} from './occurrence-type-contractor-scope.error.js'

export const OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE = {
  empty: 'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_EMPTY',
  listNotAllowed: 'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_INVALID',
  needsDocument: 'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_NEEDS_DOCUMENT',
} as const

export type OccurrenceTypeContractorScopeIssue =
  (typeof OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE)[keyof typeof OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE]

export type IsOccurrenceTypeAvailableForContractorParams = {
  readonly contractorId: string | null | undefined
  readonly contractorIds: readonly string[]
  readonly scope: OccurrenceTypeContractorScope
}

/** `all` vale para toda nota; `listed`, só para a contratante da lista — nota sem contratante nunca (D4). */
export function isOccurrenceTypeAvailableForContractor(
  params: IsOccurrenceTypeAvailableForContractorParams,
): boolean {
  if (params.scope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all) return true
  if (params.contractorId === null || params.contractorId === undefined) return false
  return params.contractorIds.includes(params.contractorId)
}

export type ValidateOccurrenceTypeContractorScopeParams = {
  readonly contractorIds: readonly string[]
  readonly moments: readonly OccurrenceMoment[]
  readonly scope: OccurrenceTypeContractorScope
}

/**
 * Todos os problemas de uma vez. A parada não tem contratante: tipo só de parada não pode ser
 * `listed`. `stop` com `document` é recusado pela 246, não aqui.
 */
export function validateOccurrenceTypeContractorScope(
  params: ValidateOccurrenceTypeContractorScopeParams,
): readonly OccurrenceTypeContractorScopeIssue[] {
  const issues: OccurrenceTypeContractorScopeIssue[] = []
  if (params.scope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all) {
    if (params.contractorIds.length > 0) {
      issues.push(OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.listNotAllowed)
    }
    return issues
  }
  if (params.contractorIds.length === 0) issues.push(OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.empty)
  const isOnlyStop = params.moments.every((moment) => moment === OCCURRENCE_MOMENT.stop)
  if (isOnlyStop) issues.push(OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.needsDocument)
  return issues
}

const ERROR_BY_ISSUE = {
  [OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.empty]: OccurrenceTypeContractorScopeEmptyError,
  [OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.listNotAllowed]:
    OccurrenceTypeContractorScopeInvalidError,
  [OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.needsDocument]:
    OccurrenceTypeContractorScopeNeedsDocumentError,
} as const

const FIELD_BY_ISSUE = {
  [OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.empty]: 'contractorIds',
  [OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.listNotAllowed]: 'contractorIds',
  [OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.needsDocument]: 'contractorScope',
} as const

/** O cadastro lança o erro do primeiro problema e leva todos nos detalhes. */
export function assertOccurrenceTypeContractorScopeIsWritable(
  params: ValidateOccurrenceTypeContractorScopeParams,
): void {
  const [first, ...others] = validateOccurrenceTypeContractorScope(params)
  if (first === undefined) return
  const details = [first, ...others].map((issue) => ({
    field: FIELD_BY_ISSUE[issue],
    message: issue,
  }))
  throw new ERROR_BY_ISSUE[first](details)
}
