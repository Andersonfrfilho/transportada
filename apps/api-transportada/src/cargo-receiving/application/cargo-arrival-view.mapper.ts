/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: a leitura da chegada. "Vencida" e os grupos são calculados aqui, pelo relógio do
 * servidor, nunca gravados.
 */
import { CARGO_ARRIVAL_DOCUMENT_STATE } from '../../shared/cargo-arrival.constant.js'
import {
  countArrivalStates,
  groupArrivalDocuments,
  type ArrivalStateCounts,
} from '../domain/cargo-arrival-grouping.policy.js'
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
  readonly record: CargoArrivalRecord
}

export function toCargoArrivalSummary({
  counts,
  now,
  record,
}: ToCargoArrivalSummaryParams): CargoArrivalSummary {
  return {
    ...record,
    arrivedAt: record.arrivedAt.toISOString(),
    counts,
    createdAt: record.createdAt.toISOString(),
    isSeparationOverdue: isSeparationOverdue({
      now,
      pendingDocumentCount: counts.total - counts[CARGO_ARRIVAL_DOCUMENT_STATE.separated],
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
      record: params.detail.arrival,
    }),
    groups: groupArrivalDocuments(documents),
  }
}

function toDocumentView(record: CargoArrivalDocumentRecord): CargoArrivalDocumentView {
  return {
    ...record,
    receivedAt: record.receivedAt?.toISOString() ?? null,
    separatedAt: record.separatedAt?.toISOString() ?? null,
  }
}
