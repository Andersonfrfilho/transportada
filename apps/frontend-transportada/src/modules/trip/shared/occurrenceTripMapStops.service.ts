/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { AssemblyMapPoint } from './assemblyMap.service'
import { OCCURRENCE_TRIP_MAP_STOP_PIN_KEY_PREFIX } from './occurrenceTripMap.constant'
import { stopColorOf } from './stopColor.service'
import type { TripStopDetail } from './trip.types'

export type OccurrenceTripMapStopsInput = Readonly<{
  /** Sem `trip.event-location` o mapa mostra todas as paradas; com ela, só a da nota. */
  drawAllStops: boolean
  /** A parada que a linha do tempo diz ser a da ocorrência (`stop.id`), quando ela veio. */
  noteStopId: null | string
  occurrence: Readonly<{ stopLabel: null | string; tripDocumentId: null | string }>
  stops: readonly TripStopDetail[]
  translate: Translate
}>

type NoteStop = Readonly<{ label: string; pinKey: null | string; sequence: number }>

export type OccurrenceTripMapStops = Readonly<{
  noteStop: NoteStop | null
  pins: readonly AssemblyMapPoint[]
}>

function coordinatesOf(
  stop: TripStopDetail,
): null | Readonly<{ latitude: number; longitude: number }> {
  const latitude = Number(stop.latitude ?? Number.NaN)
  const longitude = Number(stop.longitude ?? Number.NaN)
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
}

/** Do mais firme ao mais fraco: a parada do evento, a da nota pelo vínculo, e só então o rótulo. */
function findNoteStop(input: OccurrenceTripMapStopsInput): TripStopDetail | undefined {
  const { noteStopId, occurrence, stops } = input
  const byEvent = noteStopId === null ? undefined : stops.find((stop) => stop.id === noteStopId)
  if (byEvent !== undefined) return byEvent
  const { tripDocumentId } = occurrence
  const byDocument =
    tripDocumentId === null
      ? undefined
      : stops.find((stop) => stop.documents.some((document) => document.id === tripDocumentId))
  if (byDocument !== undefined) return byDocument
  return occurrence.stopLabel === null
    ? undefined
    : stops.find((stop) => stop.label === occurrence.stopLabel)
}

function buildStopPin(
  input: Readonly<{
    coordinates: Readonly<{ latitude: number; longitude: number }>
    isNote: boolean
    stop: TripStopDetail
    translate: Translate
  }>,
): AssemblyMapPoint {
  const { coordinates, isNote, stop, translate } = input
  const title = translate('occurrenceTripMap.stopTitle', { sequence: stop.sequence })
  return {
    ariaLabel: translate('occurrenceTripMap.stopPinLabel', {
      label: stop.label,
      sequence: stop.sequence,
    }),
    cityCode: stop.cityCode ?? '',
    color: stopColorOf(stop.sequence),
    isApproximate: false,
    isHighlighted: isNote,
    label: stop.label,
    ...coordinates,
    notes: [],
    popup: [title, stop.label],
    sequence: stop.sequence,
    stopKey: `${OCCURRENCE_TRIP_MAP_STOP_PIN_KEY_PREFIX}${stop.id}`,
    x: coordinates.longitude,
    y: coordinates.latitude,
  }
}

/**
 * ⚠️ Parada sem coordenada **não some**: a legenda a nomeia ("parada sem posição"), no mesmo espírito
 * do `TripRouteMap`. O pino só existe quando a parada foi geocodificada.
 */
export function resolveOccurrenceTripMapStops(
  input: OccurrenceTripMapStopsInput,
): OccurrenceTripMapStops {
  const noteStop = findNoteStop(input)
  const pins: AssemblyMapPoint[] = []
  for (const stop of [...input.stops].sort((first, second) => first.sequence - second.sequence)) {
    const isNote = stop.id === noteStop?.id
    if (!input.drawAllStops && !isNote) continue
    const coordinates = coordinatesOf(stop)
    if (coordinates === null) continue
    pins.push(
      buildStopPin({
        coordinates,
        isNote: input.drawAllStops && isNote,
        stop,
        translate: input.translate,
      }),
    )
  }
  return {
    noteStop:
      noteStop === undefined
        ? null
        : {
            label: noteStop.label,
            pinKey:
              coordinatesOf(noteStop) === null
                ? null
                : `${OCCURRENCE_TRIP_MAP_STOP_PIN_KEY_PREFIX}${noteStop.id}`,
            sequence: noteStop.sequence,
          },
    pins,
  }
}
