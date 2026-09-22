/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T5: as ações internas da tratativa — `review`, `warehouse_return`,
 * `contractor_submission`, `closure` e `cancel`. A validação da transição em si
 * (`checkOccurrenceCaseTransition`) já vive dentro de `DrizzleOccurrenceCaseRepository.transition`
 * (lock + recheck, T4) — este caso de uso só valida a **pré-condição de entrada** que é dele (nota
 * obrigatória em `warehouse_return`/`cancel`) e delega a ação ao repositório, propagando qualquer
 * recusa da máquina sem engolir.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ApiError } from '../../shared/api.error.js'
import type { OccurrenceCaseRepositoryPort } from './occurrence-case.port.js'

export type InternalOccurrenceCaseAction =
  | 'cancel'
  | 'closure'
  | 'contractor_submission'
  | 'review'
  | 'warehouse_return'

/** Nota obrigatória antes de chegar ao repositório — evita erro de banco por uma validação de entrada. */
export class OccurrenceCaseNoteRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CASE_NOTE_REQUIRED',
      details: [{ field: 'note', message: 'a note is required for this action' }],
      message: 'This action requires a note',
      status: 422,
    })
  }
}

export type OccurrenceCaseActionInput = {
  readonly caseId: string
  readonly context: CompanyContext
  readonly note?: string
}

export type OccurrenceCaseUseCase = {
  cancel(input: OccurrenceCaseActionInput): Promise<{
    readonly kind: 'changed' | 'unchanged'
    readonly status: string
  }>
  closure(input: OccurrenceCaseActionInput): Promise<{
    readonly kind: 'changed' | 'unchanged'
    readonly status: string
  }>
  contractorSubmission(input: OccurrenceCaseActionInput): Promise<{
    readonly kind: 'changed' | 'unchanged'
    readonly status: string
  }>
  review(input: OccurrenceCaseActionInput): Promise<{
    readonly kind: 'changed' | 'unchanged'
    readonly status: string
  }>
  warehouseReturn(input: OccurrenceCaseActionInput): Promise<{
    readonly kind: 'changed' | 'unchanged'
    readonly status: string
  }>
}

const NOTE_REQUIRED_ACTIONS = new Set<InternalOccurrenceCaseAction>(['warehouse_return', 'cancel'])

export function createOccurrenceCaseUseCase(dependencies: {
  readonly repository: OccurrenceCaseRepositoryPort
}): OccurrenceCaseUseCase {
  const { repository } = dependencies

  async function applyAction(
    action: InternalOccurrenceCaseAction,
    input: OccurrenceCaseActionInput,
  ): Promise<{ readonly kind: 'changed' | 'unchanged'; readonly status: string }> {
    const note = input.note?.trim() ?? ''
    if (NOTE_REQUIRED_ACTIONS.has(action) && note.length === 0) {
      throw new OccurrenceCaseNoteRequiredError()
    }

    const result = await repository.transition({
      action,
      actorKind: 'internal',
      actorUserId: input.context.userId,
      caseId: input.caseId,
      companyId: input.context.companyId,
      hasSettlementItems: false,
      note,
    })

    return { kind: result.kind, status: result.status }
  }

  return {
    cancel: (input) => applyAction('cancel', input),
    closure: (input) => applyAction('closure', input),
    contractorSubmission: (input) => applyAction('contractor_submission', input),
    review: (input) => applyAction('review', input),
    warehouseReturn: (input) => applyAction('warehouse_return', input),
  }
}
