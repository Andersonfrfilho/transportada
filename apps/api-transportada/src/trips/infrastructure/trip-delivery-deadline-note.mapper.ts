/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeDocumentStatus } from '../../database/nfe.schema.js'
import type { CargoArrivalReturnState } from '../../shared/cargo-arrival.constant.js'
import { resolveDeliveryOutcomeKind } from '../domain/delivery-deadline-outcome.policy.js'
import type { DeliveryDeadlineNote } from './trip-delivery-deadline.types.js'

const NFE_STATUS_CANCELLED = 'cancelled'

/** A linha das notas da viagem (`documentRecords`) com a chegada que o join trouxe, sem consulta nova. */
export type DeliveryDeadlineNoteRow = {
  readonly arrivalDeadlineBusinessDays: number | null
  readonly arrivalReturnToContractor: CargoArrivalReturnState | null
  readonly arrivedAt: Date | null
  readonly document: {
    readonly deliveredAt: Date | null
    readonly id: string
    readonly nfeDocumentId: string | null
    readonly releasedAt: Date | null
    readonly separationStatus: string
  }
  readonly nfeDocumentStatus: NfeDocumentStatus | null
}

export function toDeliveryDeadlineNote(row: DeliveryDeadlineNoteRow): DeliveryDeadlineNote {
  return {
    arrivedAt: row.arrivedAt,
    deadlineBusinessDays: row.arrivalDeadlineBusinessDays,
    documentDeliveredAt: row.document.deliveredAt,
    nfeDocumentId: row.document.nfeDocumentId,
    outcomeKind: resolveDeliveryOutcomeKind({
      isNfeCancelled: row.nfeDocumentStatus === NFE_STATUS_CANCELLED,
      isReleased: row.document.releasedAt !== null,
      returnToContractor: row.arrivalReturnToContractor,
      separationStatus: row.document.separationStatus,
    }),
    tripDocumentId: row.document.id,
  }
}
