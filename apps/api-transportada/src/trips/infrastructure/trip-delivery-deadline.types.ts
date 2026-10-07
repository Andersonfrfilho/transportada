/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import type { DeliveryOutcomeKind } from '../domain/delivery-deadline-outcome.policy.js'

export const TRIP_DELIVERY_DEADLINE_UNAVAILABLE_MESSAGE = 'trip_delivery_deadline_unavailable'

export type DeliveryDeadlineClock = { now(): Date }

export type DeliveryDeadlineReadContext = {
  readonly clock: DeliveryDeadlineClock
  readonly logger?: ApiLogger
}

export type DeliveryDeadlineNote = {
  readonly arrivedAt: Date | null
  /** A cópia gravada na chegada, nunca o perfil atual do contratante. */
  readonly deadlineBusinessDays: number | null
  /** `trip_documents.delivered_at`: só quando a nota está entregue e nenhum evento a mede. */
  readonly documentDeliveredAt: Date | null
  readonly nfeDocumentId: string | null
  readonly outcomeKind: DeliveryOutcomeKind
  readonly tripDocumentId: string
}

/** O destino físico por nota fiscal (`listStopAddresses`): o código IBGE da cidade sai daqui. */
export type DeliveryDeadlineStopAddresses = ReadonlyMap<
  string,
  { readonly components: { readonly cityCode: string | null } }
>

export type ReadTripDeliveryDeadlinesParams = {
  readonly companyId: string
  readonly context: DeliveryDeadlineReadContext
  readonly notes: readonly DeliveryDeadlineNote[]
  readonly stopAddresses: DeliveryDeadlineStopAddresses
  readonly tripId: string
}

export type DeadlineCandidate = DeliveryDeadlineNote & {
  readonly arrivedAt: Date
  readonly deadlineBusinessDays: number
}

export type LocatedCandidate = {
  readonly cityIbgeCode: string
  readonly deliveredAt: Date | null
  readonly note: DeadlineCandidate
}
