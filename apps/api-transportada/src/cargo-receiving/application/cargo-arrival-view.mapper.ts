/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: a leitura da chegada. "Vencida" e os grupos são calculados aqui, pelo relógio do
 * servidor, nunca gravados.
 */
import {
  countArrivalStates,
  groupArrivalDocuments,
  type ArrivalStateCounts,
} from '../domain/cargo-arrival-grouping.policy.js'
import { isPendingSeparation } from '../domain/cargo-arrival-return.policy.js'
import { isSeparationOverdue } from '../domain/cargo-arrival-transition.policy.js'
import type {
  CargoArrivalDetail,
  CargoArrivalDetailRecord,
  CargoArrivalDocumentRecord,
  CargoArrivalDocumentView,
  CargoArrivalRecord,
  CargoArrivalSummary,
} from './cargo-arrival.types.js'

export type ToCargoArrivalSummaryParams = {
  readonly counts: ArrivalStateCounts
  readonly now: Date
  readonly pendingSeparationCount: number
  readonly record: CargoArrivalRecord
}

export function toCargoArrivalSummary({
  counts,
  now,
  pendingSeparationCount,
  record,
}: ToCargoArrivalSummaryParams): CargoArrivalSummary {
  return {
    ...record,
    arrivedAt: record.arrivedAt.toISOString(),
    counts,
    createdAt: record.createdAt.toISOString(),
    isSeparationOverdue: isSeparationOverdue({
      now,
      pendingDocumentCount: pendingSeparationCount,
      separationDueAt: record.separationDueAt,
    }),
    separationDueAt: record.separationDueAt?.toISOString() ?? null,
  }
}

export function toCargoArrivalDetail(params: {
  readonly detail: CargoArrivalDetailRecord
  readonly now: Date
}): CargoArrivalDetail {
  const documents = params.detail.documents.map(toDocumentView)
  return {
    ...toCargoArrivalSummary({
      counts: countArrivalStates(documents),
      now: params.now,
      pendingSeparationCount: params.detail.documents.filter(isPendingSeparation).length,
      record: params.detail.arrival,
    }),
    groups: groupArrivalDocuments(documents),
  }
}

/** Campo a campo: a marcação decide o vencimento, mas não sai na leitura (ADR-0094 §9.5, ajuste 6). */
function toDocumentView(record: CargoArrivalDocumentRecord): CargoArrivalDocumentView {
  return {
    accessKey: record.accessKey,
    cityIbgeCode: record.cityIbgeCode,
    cityName: record.cityName,
    isInLiveTrip: record.isInLiveTrip,
    nfeDocumentId: record.nfeDocumentId,
    number: record.number,
    receivedAt: record.receivedAt?.toISOString() ?? null,
    recipientName: record.recipientName,
    routeName: record.routeName,
    separatedAt: record.separatedAt?.toISOString() ?? null,
    separationState: record.separationState,
    series: record.series,
  }
}
