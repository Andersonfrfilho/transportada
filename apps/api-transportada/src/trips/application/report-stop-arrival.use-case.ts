/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EventClockFields } from '../domain/occurred-at.policy.js'
import type { DriverFieldReportUnitOfWork, ReportedLocation } from './driver-field-report.port.js'
import { deriveFieldAuthorship, type FieldTripLocator } from './field-trip-target.types.js'
import { performStopArrival } from './stop-event-steps.service.js'
import type { OfficeAuditRequest } from './trip-field-office-audit.port.js'
import { resolveFieldReportOperation, withFieldReport } from './trip-field-report.port.js'

const ARRIVE_OPERATION = 'stop.arrive'

export type ReportStopArrivalInput = FieldTripLocator &
  EventClockFields & {
    readonly actorUserId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
    /** Quando a chegada aconteceu. O motorista manda agora; o escritório, a hora informada (A1). */
    readonly now: Date
    /** Spec 156 T15 M11: só o escritório manda — a trilha nasce na transação da chegada. */
    readonly officeAudit?: OfficeAuditRequest
    /** ADR-0067 §3: quando o registro foi gravado. Ausente cai em `now` — é o caso do motorista. */
    readonly recordedAt?: Date
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
  const authorship = deriveFieldAuthorship(input)

  return input.unitOfWork.execute(async (transaction) =>
    withFieldReport({
      guard: {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: resolveFieldReportOperation({ locator: input, operation: ARRIVE_OPERATION }),
        transaction,
      },
      perform: () => performStopArrival({ authorship, input, transaction }),
      recall: (eventId) => transaction.findEventById({ companyId: input.companyId, eventId }),
    }),
  )
}
