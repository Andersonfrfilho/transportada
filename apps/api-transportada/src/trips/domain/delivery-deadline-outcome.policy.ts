/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: o desfecho da nota que a política do prazo lê. Quem encerra a nota vence a entrega:
 * devolvida ao contratante, cancelada (NF-e), liberada e devolvida na rua, nessa ordem.
 */
import type { CargoArrivalReturnState } from '../../shared/cargo-arrival.constant.js'
import { CARGO_ARRIVAL_RETURN_STATE } from '../../shared/cargo-arrival.constant.js'
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'
import { DELIVERY_OUTCOME_KIND } from './delivery-deadline.constant.js'
import { DELIVERED_DOCUMENT_STATUS, RETURNED_DOCUMENT_STATUS } from './delivery-event.constant.js'

export type DeliveryOutcomeKind = (typeof DELIVERY_OUTCOME_KIND)[keyof typeof DELIVERY_OUTCOME_KIND]

export type ResolveDeliveryOutcomeKindParams = {
  readonly isNfeCancelled: boolean
  readonly isReleased: boolean
  /** `null` quando a nota não passou por chegada. */
  readonly returnToContractor: CargoArrivalReturnState | null
  readonly separationStatus: TripDocumentSeparationStatus
}

export function resolveDeliveryOutcomeKind(
  params: ResolveDeliveryOutcomeKindParams,
): DeliveryOutcomeKind {
  const { returnToContractor } = params
  if (returnToContractor !== null && returnToContractor !== CARGO_ARRIVAL_RETURN_STATE.none) {
    return DELIVERY_OUTCOME_KIND.RETURNED_TO_CONTRACTOR
  }
  if (params.isNfeCancelled) return DELIVERY_OUTCOME_KIND.CANCELLED
  if (params.isReleased) return DELIVERY_OUTCOME_KIND.RELEASED
  if (params.separationStatus === RETURNED_DOCUMENT_STATUS) return DELIVERY_OUTCOME_KIND.RETURNED
  if (params.separationStatus === DELIVERED_DOCUMENT_STATUS) return DELIVERY_OUTCOME_KIND.DELIVERED
  return DELIVERY_OUTCOME_KIND.PENDING
}
