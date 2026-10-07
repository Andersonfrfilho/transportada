/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import { TRIP_ON_ROAD_STATUSES, TRIP_STATUSES_BEFORE_DISPATCH } from './trip-state.policy.js'

/** Spec 253 RF3: a cor da linha do relatório de viagens. */
export const TRIP_REPORT_TONES = {
  finished: 'finished',
  onRoute: 'on_route',
  totalReturn: 'total_return',
  warehouse: 'warehouse',
} as const

export type TripReportTone = (typeof TRIP_REPORT_TONES)[keyof typeof TRIP_REPORT_TONES]

/**
 * `documentStatuses` são só as notas que contam no relatório: as liberadas (`released_at`) já vêm
 * filtradas fora pelo chamador. Lista vazia (encerramento manual) nunca é devolução total.
 */
export function resolveTripReportTone(
  tripStatus: TripStatus,
  documentStatuses: readonly TripDocumentSeparationStatus[],
): TripReportTone | undefined {
  if (tripStatus === 'cancelled') return undefined
  if ((TRIP_STATUSES_BEFORE_DISPATCH as readonly TripStatus[]).includes(tripStatus)) {
    return TRIP_REPORT_TONES.warehouse
  }
  if ((TRIP_ON_ROAD_STATUSES as readonly TripStatus[]).includes(tripStatus)) {
    return TRIP_REPORT_TONES.onRoute
  }
  const isTotalReturn =
    documentStatuses.length > 0 && documentStatuses.every((status) => status === 'returned')
  return isTotalReturn ? TRIP_REPORT_TONES.totalReturn : TRIP_REPORT_TONES.finished
}
