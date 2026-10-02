/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveEventLocationStamp } from '../domain/event-location-stamp.policy.js'
import type { EventLocationStampColumns } from '../domain/event-location-stamp.types.js'
import type { ReportedLocation } from './driver-field-report.port.js'
import { deriveFieldAuthorship, type FieldTripLocator } from './field-trip-target.types.js'

/**
 * ADR-0081 §3: o carimbo do toque de campo. Quem toca é o motorista quando a viagem foi achada pelo
 * vínculo dele (`{ driverId }`, no app ou no WhatsApp); o escritório chega com o alvo já resolvido
 * (`{ target }`) e age em nome dele, então não carimba. `location` ausente num toque do motorista é
 * o aparelho que não mandou ponto — `unavailable`, o mesmo de `null`.
 */
export function resolveFieldTapLocationStamp(params: {
  readonly location: ReportedLocation | null | undefined
  readonly locator: FieldTripLocator
}): EventLocationStampColumns {
  return resolveEventLocationStamp({
    channel: deriveFieldAuthorship(params.locator).channel,
    isDriverTap: params.locator.target === undefined,
    location: params.location ?? null,
  })
}
