/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  OccurrenceResolutionActorKind,
  OccurrenceResolutionEventKind,
  TripOccurrenceCaseStatus,
} from '../../database/database.schema.js'

export type OccurrenceResolutionState = 'open' | 'resolved' | 'cancelled'

/** Um evento já lido do banco; `sequence` é a ordem de gravação (identity) e decide qual é o último. */
export type OccurrenceResolutionEventFact = {
  readonly id: string
  readonly kind: OccurrenceResolutionEventKind
  readonly actorKind: OccurrenceResolutionActorKind
  readonly sequence: number
  readonly createdAt: string
  readonly note: string | undefined
  /** Status terminal da tratativa que causou o evento `system`. */
  readonly caseEventStatus: TripOccurrenceCaseStatus | undefined
  /** Spec 276 T3b: o evento `system` veio da entrega do retorno da contratante ao motorista. */
  readonly causedByContractorReply?: true
}

export type ResolveOccurrenceResolutionStateParams = {
  readonly cancelledAt: string | undefined
  readonly events: readonly OccurrenceResolutionEventFact[]
}

export type OccurrenceLastResolution = {
  readonly at: string
  readonly actorKind: OccurrenceResolutionActorKind
  readonly note: string | undefined
  readonly caseEventStatus: TripOccurrenceCaseStatus | undefined
  readonly causedByContractorReply?: true
}

export type ResolveOccurrenceResolutionStateResult = {
  readonly state: OccurrenceResolutionState
  readonly resolvedAt: string | null
  readonly reopenedAt: string | null
  readonly lastResolution: OccurrenceLastResolution | null
}

export type SystemResolutionPhraseKey =
  | 'case_closed'
  | 'case_returned_to_warehouse'
  | 'case_cancelled'
  | 'contractor_reply_delivered'

/** O estado de um item do feed; `open` é a ausência do objeto (`resolution: null`). */
export type FeedResolutionView = {
  readonly state: 'resolved' | 'reopened' | 'cancelled'
  readonly at: string
  readonly actorKind: OccurrenceResolutionActorKind
}

/** Os valores do filtro `resolutionStateIn`. */
export type FeedResolutionStateFilter = 'open' | 'resolved' | 'reopened' | 'cancelled'
