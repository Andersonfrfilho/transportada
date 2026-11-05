/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverFieldReportUnitOfWork, ReportedLocation } from './driver-field-report.port.js'
import { deriveFieldAuthorship, type FieldTripLocator } from './field-trip-target.types.js'
import { performStopDeparture } from './stop-event-steps.service.js'
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
      perform: () => performStopDeparture({ authorship, input, transaction }),
      recall: async (eventId) => {
        const event = await transaction.findEventById({ companyId: input.companyId, eventId })
        return event === null ? null : { changed: true, id: event.id }
      },
    }),
  )
}
