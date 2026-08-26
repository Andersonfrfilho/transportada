/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TripStopNotReachableError } from '../domain/trip.error.js'
import type { DriverFieldReportUnitOfWork, ReportedLocation } from './driver-field-report.port.js'
import { withFieldReport } from './trip-field-report.port.js'

const ARRIVE_OPERATION = 'stop.arrive'
const DISPATCHED_STATUS = 'dispatched'

export type ReportStopArrivalInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly driverId: string
  readonly idempotencyKey: string
  readonly location: ReportedLocation | null
  readonly now: Date
  readonly stopId: string
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type ReportStopArrivalResult = { readonly id: string }

/**
 * Spec 057, P1 "cheguei": um toque grava `arrived_at`, carimba a coordenada **se houver**, e leva a
 * viagem de `dispatched` a `in_transit`.
 *
 * `location` nulo é caso normal, não degradado (ADR-0045 §3.1): GPS desligado, sem sinal no galpão
 * ou permissão negada confirmam a chegada do mesmo jeito.
 */
export async function reportStopArrival(
  input: ReportStopArrivalInput,
): Promise<ReportStopArrivalResult> {
  return input.unitOfWork.execute(async (transaction) =>
    withFieldReport(
      {
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: ARRIVE_OPERATION,
        transaction,
      },
      async () => {
        const stop = await transaction.findStopForDriver({
          companyId: input.companyId,
          driverId: input.driverId,
          stopId: input.stopId,
        })
        if (stop === null) throw new TripStopNotReachableError()

        // Chegar de novo na mesma parada não reescreve a hora: a primeira é a que aconteceu.
        if (stop.arrivedAt === null) {
          await transaction.markStopArrived({
            at: input.now,
            companyId: input.companyId,
            stopId: input.stopId,
          })
        }
        if (stop.tripStatus === DISPATCHED_STATUS) {
          await transaction.markTripInTransit({
            companyId: input.companyId,
            tripId: stop.tripId,
          })
        }

        return transaction.recordEvent({
          actorUserId: input.actorUserId,
          companyId: input.companyId,
          documentId: null,
          kind: 'arrived',
          location: input.location,
          stopId: input.stopId,
        })
      },
      (eventId) => transaction.findEventById({ companyId: input.companyId, eventId }),
    ),
  )
}
