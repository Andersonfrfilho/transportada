/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §3/§4 / spec 196 D3/D4: o carimbo inteiro do evento — ponto e estado — numa função só.
 * Só o toque do motorista carimba; a troca que ele deriva, o escritório, o backoffice e o operador
 * pelo WhatsApp gravam tudo `null`.
 */
import { EVENT_LOCATION_STATES } from '../../database/event-location.schema.js'
import type {
  EventLocationStampColumns,
  ResolveEventLocationStampParams,
} from './event-location-stamp.types.js'
import { TRIP_FIELD_CHANNELS } from './trip-field-channel.constant.js'

export const NO_EVENT_LOCATION_STAMP: EventLocationStampColumns = {
  accuracyMeters: null,
  capturedAt: null,
  latitude: null,
  locationState: null,
  longitude: null,
}

/** Os canais por onde é o motorista quem toca. Escritório e backoffice agem em nome dele. */
const DRIVER_TAP_CHANNELS: readonly string[] = [
  TRIP_FIELD_CHANNELS.driverApp,
  TRIP_FIELD_CHANNELS.whatsapp,
]

export function resolveEventLocationStamp(
  params: ResolveEventLocationStampParams,
): EventLocationStampColumns {
  if (!params.isDriverTap) return NO_EVENT_LOCATION_STAMP
  if (!DRIVER_TAP_CHANNELS.includes(params.channel)) return NO_EVENT_LOCATION_STAMP
  if (params.location === null) {
    return { ...NO_EVENT_LOCATION_STAMP, locationState: EVENT_LOCATION_STATES.unavailable }
  }

  return {
    accuracyMeters: params.location.accuracyMeters,
    capturedAt: new Date(params.location.capturedAt),
    latitude: params.location.latitude,
    locationState: EVENT_LOCATION_STATES.captured,
    longitude: params.location.longitude,
  }
}
