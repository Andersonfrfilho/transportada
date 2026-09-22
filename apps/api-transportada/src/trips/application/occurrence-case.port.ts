/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T5: o que o caso de uso das ações internas precisa do repositório — só `transition`,
 * para permitir dublê nos testes de contrato sem tocar banco. `DrizzleOccurrenceCaseRepository`
 * (T4) implementa esta porta.
 */
import type {
  TripOccurrenceCaseActorKind,
  TripOccurrenceCaseDecisionKind,
  TripOccurrenceCaseRedeliveryApplication,
  TripOccurrenceCaseStatus,
} from '../../database/trip.schema.js'

export type OccurrenceCaseTransitionInput = {
  readonly action: 'cancel' | 'closure' | 'contractor_submission' | 'review' | 'warehouse_return'
  readonly actorKind: TripOccurrenceCaseActorKind
  /** Spec 164 T9: obrigatória para os dois atores — interno ou contratante. */
  readonly actorUserId: string
  readonly caseId: string
  readonly companyId: string
  readonly decisionKind?: TripOccurrenceCaseDecisionKind
  readonly decisionNote?: string
  readonly hasSettlementItems: boolean
  readonly note: string
  readonly redeliveryApplication?: TripOccurrenceCaseRedeliveryApplication
}

export type OccurrenceCaseTransitionResult = {
  readonly kind: 'changed' | 'unchanged'
  readonly status: TripOccurrenceCaseStatus
}

export type OccurrenceCaseRepositoryPort = {
  transition(input: OccurrenceCaseTransitionInput): Promise<OccurrenceCaseTransitionResult>
}
