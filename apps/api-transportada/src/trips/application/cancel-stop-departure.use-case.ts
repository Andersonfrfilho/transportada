/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isDepartureTapStale, resolveDepartureTappedAt } from '../domain/departure-order.policy.js'
import {
  TripStopDepartureNotCancellableError,
  TripStopNotReachableError,
} from '../domain/trip.error.js'
import type { DriverFieldReportUnitOfWork, ReportedLocation } from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldTripLocator,
} from './field-trip-target.types.js'
import { resolveFieldReportOperation, withFieldReport } from './trip-field-report.port.js'

const CANCEL_DEPARTURE_OPERATION = 'stop.cancel-departure'

export type CancelStopDepartureInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  readonly idempotencyKey: string
  readonly location: ReportedLocation | null
  readonly now: Date
  readonly stopId: string
  readonly tappedAt: Date
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type CancelStopDepartureResult = { readonly changed: boolean; readonly id: string | null }

/**
 * Spec 206 D18 (ADR-0088 §2b): "Cancelar rota" desfaz o "Iniciar rota" a qualquer momento antes do
 * Cheguei. Zera `en_route_*` **só da própria parada**, grava `departure_cancelled` na história —
 * o `departed` fica — e **não** transiciona `trips.status`: a viagem segue `on_delivery_route`.
 *
 * **Não inicia parada nenhuma.** Ir para outra são dois toques: cancelar aqui, iniciar lá.
 */
export async function cancelStopDeparture(
  input: CancelStopDepartureInput,
): Promise<CancelStopDepartureResult> {
  const authorship = deriveFieldAuthorship(input)

  return input.unitOfWork.execute(async (transaction) =>
    withFieldReport({
      guard: {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: resolveFieldReportOperation({
          locator: input,
          operation: CANCEL_DEPARTURE_OPERATION,
        }),
        transaction,
      },
      perform: async () => {
        const stop = await transaction.findStopForDriver({
          companyId: input.companyId,
          stopId: input.stopId,
          target: toFieldTripTarget(input),
        })
        if (stop === null) throw new TripStopNotReachableError()

        // ADR-0068 §2 (D4/D18): a mesma trava do depart, na mesma ordem.
        await transaction.lockTripStops({ companyId: input.companyId, tripId: stop.tripId })

        const decision = await transaction.readDepartureDecision({
          companyId: input.companyId,
          stopId: input.stopId,
          tripId: stop.tripId,
        })

        const dispatchedAt = await transaction.findInformedTimeWindowStart({
          companyId: input.companyId,
          tripId: stop.tripId,
        })
        const resolvedTappedAt = resolveDepartureTappedAt({
          dispatchedAt,
          now: input.now,
          tappedAt: input.tappedAt,
        })

        // D18, ordem das decisões — 1) tappedAt velho, antes da recusa.
        if (
          isDepartureTapStale({
            lastArrivedAt: decision.lastArrivedAt,
            lastDepartedTappedAt: decision.lastDepartedTappedAt,
            resolvedTappedAt,
          })
        ) {
          return { changed: false, id: null }
        }

        // D18 — 2) parada chegada ou concluída: 409, com o motivo mais específico primeiro.
        if (decision.stop.completedAt !== null) {
          throw new TripStopDepartureNotCancellableError('completed')
        }
        if (decision.stop.arrivedAt !== null) {
          throw new TripStopDepartureNotCancellableError('arrived')
        }

        // D18 — 3) parada sem "a caminho": no-op. Cancelar duas vezes é inofensivo.
        if (decision.stop.enRouteSince === null) {
          return { changed: false, id: null }
        }

        await transaction.clearStopEnRoute({
          companyId: input.companyId,
          stopId: input.stopId,
          updatedAt: input.now,
        })

        const event = await transaction.recordEvent({
          actorUserId: input.actorUserId,
          authorship,
          companyId: input.companyId,
          documentId: null,
          kind: 'departure_cancelled',
          location: input.location,
          occurredAt: input.now,
          stopId: input.stopId,
          tappedAt: resolvedTappedAt,
        })

        return { changed: true, id: event.id }
      },
      recall: async (eventId) => {
        const event = await transaction.findEventById({ companyId: input.companyId, eventId })
        return event === null ? null : { changed: true, id: event.id }
      },
    }),
  )
}
