/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isDepartureTapStale, resolveDepartureTappedAt } from '../domain/departure-order.policy.js'
import { TripHasStopEnRouteError, TripStopNotReachableError } from '../domain/trip.error.js'
import type { DriverFieldReportUnitOfWork, ReportedLocation } from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldTripLocator,
} from './field-trip-target.types.js'
import { resolveFieldReportOperation, withFieldReport } from './trip-field-report.port.js'

const DEPART_OPERATION = 'stop.depart'

export type ReportStopDepartureInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  readonly idempotencyKey: string
  readonly location: ReportedLocation | null
  /** A hora do servidor — usada em `en_route_since` e no evento. */
  readonly now: Date
  readonly stopId: string
  /** ADR-0088 §4 (D3): a hora do aparelho no toque. Obrigatória — a rota é nova. */
  readonly tappedAt: Date
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type ReportStopDepartureResult = { readonly changed: boolean; readonly id: string | null }

/**
 * Spec 206 D1/D2/D4/D5 (ADR-0088 §2/§4): o primeiro toque em "Iniciar rota" marca a parada como "a
 * caminho" e, se a viagem ainda não estava, a leva a `on_delivery_route`.
 *
 * **Nunca escreve em duas paradas.** Com outra parada da viagem a caminho, a resposta é
 * `409 TRIP_HAS_STOP_EN_ROUTE` — não existe troca (Revisão 2).
 */
export async function reportStopDeparture(
  input: ReportStopDepartureInput,
): Promise<ReportStopDepartureResult> {
  const authorship = deriveFieldAuthorship(input)

  return input.unitOfWork.execute(async (transaction) =>
    withFieldReport({
      guard: {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: resolveFieldReportOperation({ locator: input, operation: DEPART_OPERATION }),
        transaction,
      },
      perform: async () => {
        const stop = await transaction.findStopForDriver({
          companyId: input.companyId,
          stopId: input.stopId,
          target: toFieldTripTarget(input),
        })
        if (stop === null) throw new TripStopNotReachableError()

        // ADR-0068 §2 (D4): as paradas da viagem, travadas antes de qualquer decisão.
        await transaction.lockTripStops({ companyId: input.companyId, tripId: stop.tripId })

        const decision = await transaction.readDepartureDecision({
          companyId: input.companyId,
          stopId: input.stopId,
          tripId: stop.tripId,
        })

        // D2, ordem das decisões — 1) já a caminho, chegada ou concluída: no-op.
        if (
          decision.stop.enRouteSince !== null ||
          decision.stop.arrivedAt !== null ||
          decision.stop.completedAt !== null
        ) {
          return { changed: false, id: null }
        }

        const dispatchedAt = await transaction.findInformedTimeWindowStart({
          companyId: input.companyId,
          tripId: stop.tripId,
        })
        const resolvedTappedAt = resolveDepartureTappedAt({
          dispatchedAt,
          now: input.now,
          tappedAt: input.tappedAt,
        })

        // D2 — 2) tappedAt velho, mesmo com outra parada a caminho (a ordem importa).
        if (
          isDepartureTapStale({
            lastArrivedAt: decision.lastArrivedAt,
            lastDepartedTappedAt: decision.lastDepartedTappedAt,
            resolvedTappedAt,
          })
        ) {
          return { changed: false, id: null }
        }

        // D2/D4 — 3) só agora a recusa: outra parada da viagem está a caminho.
        if (decision.enRouteStop !== null) {
          throw new TripHasStopEnRouteError({
            enRouteStopId: decision.enRouteStop.id,
            enRouteStopSequence: decision.enRouteStop.sequence,
          })
        }

        await transaction.markStopEnRoute({
          companyId: input.companyId,
          since: input.now,
          stopId: input.stopId,
          tappedAt: resolvedTappedAt,
        })
        // D5: só transiciona se a viagem ainda não estava na rua (dispatched/in_transit).
        await transaction.markTripOnDeliveryRoute({
          actorUserId: input.actorUserId,
          at: input.now,
          authorship,
          companyId: input.companyId,
          tripId: stop.tripId,
        })

        const event = await transaction.recordEvent({
          actorUserId: input.actorUserId,
          authorship,
          companyId: input.companyId,
          documentId: null,
          kind: 'departed',
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
