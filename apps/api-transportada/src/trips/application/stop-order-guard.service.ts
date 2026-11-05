/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF25/RF27: a conferência da ordem da parada, na transação da tripulação e sob a trava das paradas.
 */
import { TripStopOutOfOrderError } from '../domain/stop-order.error.js'
import { resolveStopOrderViolation } from '../domain/stop-order.policy.js'
import type { StopOrderCheckInput } from '../domain/stop-order.policy.js'
import type { DriverFieldReportTransactionPort } from './driver-field-report.port.js'

export type AssertStopInOrderParams = Pick<
  StopOrderCheckInput,
  'authorship' | 'requestedEvent' | 'requestedStopId'
> & {
  readonly companyId: string
  readonly confirmOutOfOrder: boolean | undefined
  readonly transaction: DriverFieldReportTransactionPort
  readonly tripId: string
}

export async function assertStopInOrder(params: AssertStopInOrderParams): Promise<void> {
  if (params.authorship === 'office' || params.confirmOutOfOrder === true) return

  const candidates = await params.transaction.findNextStopCandidates({
    companyId: params.companyId,
    tripId: params.tripId,
  })
  const violation = resolveStopOrderViolation({
    authorship: params.authorship,
    requestedEvent: params.requestedEvent,
    requestedStopId: params.requestedStopId,
    stops: candidates.stops,
  })
  if (violation !== null) throw new TripStopOutOfOrderError(violation)
}
