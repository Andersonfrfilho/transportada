/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF19: o "saí" e o "cheguei" do atendente no WhatsApp vão pelas MESMAS funções do escritório
 * (`reportStopArrival`/`reportStopDeparture` com `target`): a viagem é resolvida, a autoria é `office`, o ator é
 * o usuário do atendente e o registro é em nome do motorista da viagem. O escritório não passa pela ordem da
 * parada nem marca etapa junto.
 */
import type { FieldTripTargetPort } from '../../trips/application/field-trip-target.port.js'
import { FIELD_TRIP_TARGET_KIND } from '../../trips/application/field-trip-target.types.js'
import { resolveFieldTripTarget } from '../../trips/application/resolve-field-trip-target.use-case.js'
import type { ResolvedTripFieldTarget } from '../../trips/application/field-trip-target.types.js'
import type { OfficeAuditRequest } from '../../trips/application/trip-field-office-audit.port.js'
import type { OfficeStopEventInput } from '../../whatsapp/infrastructure/whatsapp-group-stop.adapter.js'

type OfficeStopReport = {
  readonly actorUserId: string
  readonly companyId: string
  readonly idempotencyKey: string
  readonly location: null
  readonly stopId: string
  readonly tappedAt: Date
  readonly target: ResolvedTripFieldTarget
}

/** O canal na trilha: o IP do escritório não existe aqui, o campo diz de onde veio. */
const WHATSAPP_AUDIT_ORIGIN = 'whatsapp'
const ARRIVE_AUDIT_ACTION = 'trip_field_office.stop_arrive'

export function createWhatsAppOfficeStopEvents(dependencies: {
  readonly reportArrival: (
    input: OfficeStopReport & {
      readonly officeAudit: OfficeAuditRequest
    },
  ) => Promise<unknown>
  readonly reportDeparture: (input: OfficeStopReport) => Promise<{ readonly changed: boolean }>
  readonly targets: FieldTripTargetPort
}) {
  const resolveTarget = (input: OfficeStopEventInput) =>
    resolveFieldTripTarget({
      companyId: input.companyId,
      repository: dependencies.targets,
      target: {
        driverId: input.driverId,
        kind: FIELD_TRIP_TARGET_KIND.trip,
        tripId: input.tripId,
      },
    })

  return {
    arrive: async (input: OfficeStopEventInput) =>
      dependencies.reportArrival({
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        location: null,
        officeAudit: {
          action: ARRIVE_AUDIT_ACTION,
          correlationId: crypto.randomUUID(),
          ipAddress: WHATSAPP_AUDIT_ORIGIN,
        },
        stopId: input.stopId,
        tappedAt: input.tappedAt,
        target: await resolveTarget(input),
      }),
    depart: async (input: OfficeStopEventInput) =>
      dependencies.reportDeparture({
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        location: null,
        stopId: input.stopId,
        tappedAt: input.tappedAt,
        target: await resolveTarget(input),
      }),
  }
}
