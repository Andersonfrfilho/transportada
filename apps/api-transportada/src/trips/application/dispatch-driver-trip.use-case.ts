/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DispatchTripResult } from './dispatch-trip.use-case.js'
import type { EventLocationStampColumns } from '../domain/event-location-stamp.types.js'
import { resolveEventLocationStamp } from '../domain/event-location-stamp.policy.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import type { ReportedLocation } from './driver-field-report.port.js'
import { TripCrewHelperCannotDriveError, TripNotOfDriverError } from '../domain/trip.error.js'
import type { TripCrewRole } from '../../shared/trip-crew-role.constant.js'

export type DriverTripLinkagePort = {
  /** `null` cobre viagem alheia **e** viagem inexistente — o 403 não distingue, de propósito. */
  findCrewRole(input: {
    readonly companyId: string
    readonly driverId: string
    readonly tripId: string
  }): Promise<TripCrewRole | null>
}

export type DispatchDriverTripInput = {
  readonly actorUserId: string
  readonly companyId: string
  /**
   * ADR-0058 §2: a máquina não muda — este é o mesmo `dispatchTrip` do escritório, com o mesmo
   * snapshot e a mesma idempotência (`unchanged` na repetição). Sem `force`: pendência de carga se
   * resolve no barracão, não na cabine.
   */
  readonly dispatch: (input: {
    readonly actorUserId: string
    /** Spec 196 T3.3: o ponto do toque, que o `dispatchTrip` leva até `trip_status_events`. */
    readonly locationStamp: EventLocationStampColumns
    readonly tripId: string
  }) => Promise<DispatchTripResult>
  readonly driverId: string
  readonly linkage: DriverTripLinkagePort
  /** Spec 196 T3.3: `null` é o toque sem ponto — carimba `unavailable`, não some. */
  readonly location: ReportedLocation | null
  readonly tripId: string
}

/**
 * ADR-0058 §1: o motorista vinculado (`trip_drivers`) despacha a própria viagem. Sem permissão
 * nova — o recorte é o vínculo, como em todo `/me/trips/current/*`.
 *
 * Spec 149 (ADR-0065): o vínculo sozinho não basta — o ajudante da mesma tripulação tem a linha em
 * `trip_drivers`, mas não o papel `driver`. Só ele despacha (critério de aceite 3).
 */
export async function dispatchDriverTrip(
  input: DispatchDriverTripInput,
): Promise<DispatchTripResult> {
  const role = await input.linkage.findCrewRole({
    companyId: input.companyId,
    driverId: input.driverId,
    tripId: input.tripId,
  })
  if (role === null) throw new TripNotOfDriverError()
  if (role !== 'driver') throw new TripCrewHelperCannotDriveError()

  return input.dispatch({
    actorUserId: input.actorUserId,
    locationStamp: resolveEventLocationStamp({
      channel: TRIP_FIELD_CHANNELS.driverApp,
      isDriverTap: true,
      location: input.location,
    }),
    tripId: input.tripId,
  })
}
