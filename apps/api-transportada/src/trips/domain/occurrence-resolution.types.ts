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
  /** Spec 321 T4 (D5): o evento `system` veio da coleta de canhoto (aprovado resolve, reprovado reabre). */
  readonly causedByCanhotoPickup?: true
  /** Spec 321 T8: a coleta resolveu ao ser encaixada numa viagem nova (sem esta marca, foi o canhoto aprovado). */
  readonly canhotoPickupScheduled?: true
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
  readonly causedByCanhotoPickup?: true
  readonly canhotoPickupScheduled?: true
}

export type ResolveOccurrenceResolutionStateResult = {
  readonly state: OccurrenceResolutionState
  readonly resolvedAt: string | null
  readonly reopenedAt: string | null
  readonly lastResolution: OccurrenceLastResolution | null
}

/**
 * As frases fixas do `system` (o motorista e o painel nunca leem a nota interna). Cópia por valor no painel
 * (`tripOccurrenceTimeline.service.ts`) e no app do motorista (`ROUTE_OCCURRENCE_PHRASE_KEYS` + locales pt/en), cada
 * uma cobrada por contrato com esta mesma lista literal.
 */
export const SYSTEM_RESOLUTION_PHRASE_KEYS = [
  'case_closed',
  'case_returned_to_warehouse',
  'case_cancelled',
  'contractor_reply_delivered',
  /** Spec 321 T4 (D5): o canhoto retido pelo cliente foi coletado e aprovado na conferência. */
  'canhoto_collected',
  /** Spec 321 T8: a nota foi encaixada numa nova viagem para buscar o canhoto; a ocorrência conclui ali. */
  'canhoto_scheduled',
] as const

export type SystemResolutionPhraseKey = (typeof SYSTEM_RESOLUTION_PHRASE_KEYS)[number]

/** O estado de um item do feed; `open` é a ausência do objeto (`resolution: null`). */
export type FeedResolutionView = {
  readonly state: 'resolved' | 'reopened' | 'cancelled'
  readonly at: string
  readonly actorKind: OccurrenceResolutionActorKind
}

/** Os valores do filtro `resolutionStateIn`. */
export type FeedResolutionStateFilter = 'open' | 'resolved' | 'reopened' | 'cancelled'
