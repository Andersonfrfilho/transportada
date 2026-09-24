/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T5: as ações internas da tratativa — `review`, `warehouse_return`,
 * `contractor_submission`, `closure` e `cancel`. A validação da transição em si
 * (`checkOccurrenceCaseTransition`) já vive dentro de `DrizzleOccurrenceCaseRepository.transition`
 * (lock + recheck, T4) — este caso de uso só valida a **pré-condição de entrada** que é dele (nota
 * obrigatória em `warehouse_return`/`cancel`) e delega a ação ao repositório, propagando qualquer
 * recusa da máquina sem engolir.
 *
 * Achado 1 da revisão da spec 164 (o escritório decide em nome de quem não responde): `decide` entra
 * aqui com `actorKind: 'internal'` **fixo** — nunca parâmetro — porque é essa constante que impede
 * um ator interno assinar como se fosse o contratante (a separação vive na rota/caso de uso, nunca
 * no corpo da requisição). Nota é **sempre** obrigatória, diferente do contratante
 * (`decide-occurrence-case.use-case.ts`, onde só `other` exige): decidir no lugar de alguém sem
 * dizer por quê não pode ser silencioso. A máquina (`checkOccurrenceCaseTransition`, dentro do
 * repositório) segue sendo a única fonte de verdade sobre transição, conflito de decisão divergente
 * (409 `OCCURRENCE_CASE_DECISION_CONFLICT`) e bloqueio de reentrega (422
 * `OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED`) — este caso de uso não reimplementa nada disso.
 */
import type { TripOccurrenceCaseDecisionKind } from '../../database/trip.schema.js'
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

export type OccurrenceCaseDecisionInput = {
  readonly caseId: string
  readonly context: CompanyContext
  readonly kind: TripOccurrenceCaseDecisionKind
  readonly note: string
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
  /** A decisão em nome do contratante (achado 1 da revisão da spec 164). Nota sempre obrigatória. */
  decide(input: OccurrenceCaseDecisionInput): Promise<{
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
      note,
    })

    return { kind: result.kind, status: result.status }
  }

  async function decide(
    input: OccurrenceCaseDecisionInput,
  ): Promise<{ readonly kind: 'changed' | 'unchanged'; readonly status: string }> {
    const note = input.note.trim()
    if (note.length === 0) throw new OccurrenceCaseNoteRequiredError()

    const result = await repository.transition({
      action: 'decide',
      actorKind: 'internal',
      actorUserId: input.context.userId,
      caseId: input.caseId,
      companyId: input.context.companyId,
      decisionKind: input.kind,
      decisionNote: note,
      note,
    })

    return { kind: result.kind, status: result.status }
  }

  return {
    cancel: (input) => applyAction('cancel', input),
    closure: (input) => applyAction('closure', input),
    contractorSubmission: (input) => applyAction('contractor_submission', input),
    decide,
    review: (input) => applyAction('review', input),
    warehouseReturn: (input) => applyAction('warehouse_return', input),
  }
}
