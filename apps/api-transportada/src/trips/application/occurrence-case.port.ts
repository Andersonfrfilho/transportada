/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T5: o que o caso de uso das ações internas precisa do repositório — só `transition`,
 * para permitir dublê nos testes de contrato sem tocar banco. `DrizzleOccurrenceCaseRepository`
 * (T4) implementa esta porta.
 *
 * ⚠️ **Nenhuma pré-condição contada fora da transação entra aqui.** `hasSettlementItems` era campo
 * desta entrada e os três chamadores passavam o literal `false` — o fechamento de `goods_paid`
 * respondia 422 para sempre. Quem conta os itens é o escritor único, sobre a linha travada, dentro
 * da mesma transação do fechamento (mesma classe de defeito que a spec 158 já registrou).
 */
import type {
  TripOccurrenceCaseActorKind,
  TripOccurrenceCaseDecisionKind,
  TripOccurrenceCaseStatus,
} from '../../database/trip.schema.js'

export type OccurrenceCaseTransitionInput = {
  readonly action:
    | 'cancel'
    | 'closure'
    | 'contractor_submission'
    | 'decide'
    | 'review'
    | 'warehouse_return'
  readonly actorKind: TripOccurrenceCaseActorKind
  /** Spec 164 T9: obrigatória para os dois atores — interno ou contratante. */
  readonly actorUserId: string
  readonly caseId: string
  readonly companyId: string
  readonly decisionKind?: TripOccurrenceCaseDecisionKind
  readonly decisionNote?: string
  readonly note: string
}

export type OccurrenceCaseTransitionResult = {
  readonly kind: 'changed' | 'unchanged'
  readonly status: TripOccurrenceCaseStatus
}

export type OccurrenceCaseRepositoryPort = {
  transition(input: OccurrenceCaseTransitionInput): Promise<OccurrenceCaseTransitionResult>
}
