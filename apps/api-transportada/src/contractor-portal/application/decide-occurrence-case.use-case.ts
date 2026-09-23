/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T10: a decisão do contratante — `GET /client/me/occurrences` e
 * `POST /client/me/occurrences/:id/decision`. `requireOccurrenceInScope` roda **antes** de qualquer
 * outra leitura (molde de `requireBatchInScope`), e fora de escopo é `404`, nunca `403` (correção 1
 * e 3 do `architect`): quem chama nunca aprende se a ocorrência existe.
 *
 * ⚠️ `actorKind: 'contractor'` é constante literal desta rota — nunca parâmetro de entrada. Quem
 * garante que o chamador é mesmo o contratante é `resolveContractorScope`, chamado aqui dentro, não
 * o token sozinho (correção 1 do `architect`: papel + grupo + concessão direta somam, e um interno
 * com `groups.manage` poderia se conceder `occurrences.decide`).
 */
import type { TripOccurrenceCaseDecisionKind } from '../../database/trip.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ApiError } from '../../shared/api.error.js'
import { OccurrenceCaseDecisionConflictError } from '../../trips/domain/trip.error.js'
import { ContractorOccurrenceNotFoundError } from '../domain/contractor-portal.error.js'
import type { ContractorScope } from '../domain/contractor-scope.policy.js'
import type {
  ContractorOccurrenceDetail,
  ContractorOccurrenceListItem,
} from '../infrastructure/contractor-occurrence.query.js'

/** Molde de `OccurrenceCaseNoteRequiredError` (`occurrence-case.use-case.ts`) — mesma regra, ator externo. */
export class ContractorOccurrenceNoteRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CASE_NOTE_REQUIRED',
      details: [{ field: 'note', message: 'a note is required for this decision' }],
      message: 'This decision requires a note',
      status: 422,
    })
  }
}

const OCCURRENCE_LIST_LIMIT = 50

export type ContractorOccurrenceCaseTransition = {
  readonly kind: 'changed' | 'unchanged'
  readonly status: string
}

export type DecideOccurrenceCaseUseCase = {
  decide(input: {
    readonly context: CompanyContext
    readonly kind: TripOccurrenceCaseDecisionKind
    readonly note?: string
    readonly occurrenceId: string
  }): Promise<ContractorOccurrenceCaseTransition>
  list(input: {
    readonly context: CompanyContext
  }): Promise<readonly ContractorOccurrenceListItem[]>
}

export function createDecideOccurrenceCaseUseCase(dependencies: {
  readonly cases: {
    transition(input: {
      readonly action: 'decide'
      readonly actorKind: 'contractor'
      readonly actorUserId: string
      readonly caseId: string
      readonly companyId: string
      readonly decisionKind: TripOccurrenceCaseDecisionKind
      readonly decisionNote: string
      readonly note: string
    }): Promise<{ readonly kind: 'changed' | 'unchanged'; readonly status: string }>
  }
  readonly occurrences: {
    findDetail(input: {
      readonly companyId: string
      readonly occurrenceId: string
      readonly scope: ContractorScope
    }): Promise<ContractorOccurrenceDetail | null>
    list(input: {
      readonly companyId: string
      readonly limit: number
      readonly scope: ContractorScope
    }): Promise<readonly ContractorOccurrenceListItem[]>
  }
  readonly repository: {
    resolveScope(input: { readonly context: CompanyContext }): Promise<ContractorScope>
  }
}): DecideOccurrenceCaseUseCase {
  async function resolveScope(context: CompanyContext): Promise<ContractorScope> {
    return dependencies.repository.resolveScope({ context })
  }

  async function requireOccurrenceInScope(input: {
    readonly context: CompanyContext
    readonly occurrenceId: string
  }): Promise<{ readonly detail: ContractorOccurrenceDetail; readonly scope: ContractorScope }> {
    const scope = await resolveScope(input.context)
    const detail = await dependencies.occurrences.findDetail({
      companyId: input.context.companyId,
      occurrenceId: input.occurrenceId,
      scope,
    })
    if (detail === null) throw new ContractorOccurrenceNotFoundError()
    return { detail, scope }
  }

  return {
    async decide({ context, kind, note, occurrenceId }) {
      const { detail } = await requireOccurrenceInScope({ context, occurrenceId })
      const trimmedNote = note?.trim() ?? ''

      if (kind === 'other' && trimmedNote.length === 0) {
        throw new ContractorOccurrenceNoteRequiredError()
      }

      /**
       * RF16: decisão repetida (mesma dupla `kind`/`note`) converge; decisão **diferente** sobre
       * tratativa já `decided` é 409, nunca sobrescrita — a máquina (`checkOccurrenceCaseTransition`)
       * não distingue "mesma decisão" de "outra decisão", ela só sabe que o estado de destino já foi
       * alcançado; quem faz essa distinção é este caso de uso, antes de chamar o repositório.
       */
      /**
       * ⚠️ Esta comparação é **atalho**, não garantia: ela lê fora da transação, então duas abas
       * decidindo ao mesmo tempo passam as duas por aqui. Quem decide de verdade é o escritor
       * único, sobre a linha travada (`OccurrenceCaseDecisionConflictError`).
       */
      if (
        detail.caseStatus === 'decided' &&
        (detail.decisionKind !== kind || detail.decisionNote !== trimmedNote)
      ) {
        throw new OccurrenceCaseDecisionConflictError()
      }

      const result = await dependencies.cases.transition({
        action: 'decide',
        actorKind: 'contractor',
        actorUserId: context.userId,
        caseId: detail.caseId,
        companyId: context.companyId,
        decisionKind: kind,
        decisionNote: trimmedNote,
        note: trimmedNote,
      })

      return { kind: result.kind, status: result.status }
    },
    async list({ context }) {
      const scope = await resolveScope(context)
      return dependencies.occurrences.list({
        companyId: context.companyId,
        limit: OCCURRENCE_LIST_LIMIT,
        scope,
      })
    },
  }
}
