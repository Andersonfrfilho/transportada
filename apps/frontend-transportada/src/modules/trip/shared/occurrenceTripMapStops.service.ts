/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { AssemblyMapPoint } from './assemblyMap.service'
import { OCCURRENCE_TRIP_MAP_STOP_PIN_KEY_PREFIX } from './occurrenceTripMap.constant'
import { stopColorOf } from './stopColor.service'
import type { TripDocumentDetail, TripStopDetail } from './trip.types'

/** A dica não vira lista: passou disso, uma linha diz quantas notas faltam. */
const STOP_POPUP_MAX_DOCUMENTS = 3

export type OccurrenceTripMapStopsInput = Readonly<{
  /**
   * Sem `trip.event-location` o halo vai na parada da nota; com ela, o halo é da ocorrência e a
   * parada da nota fica igual às outras. Todas as paradas com ponto são desenhadas nos dois casos.
   */
  highlightNoteStop: boolean
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

/** Uma linha por nota viva da parada: número e destinatário, o que o escritório procura no pino. */
function documentLines(stop: TripStopDetail, translate: Translate): readonly string[] {
  const live = stop.documents.filter((document) => document.releasedAt === null)
  const lines = live
    .slice(0, STOP_POPUP_MAX_DOCUMENTS)
    .map((document) => documentLine(document, translate))
  const rest = live.length - STOP_POPUP_MAX_DOCUMENTS
  return rest > 0
    ? [...lines, translate('occurrenceTripMap.stopMoreDocuments', { count: rest })]
    : lines
}

function documentLine(document: TripDocumentDetail, translate: Translate): string {
  const number = document.nfeNumber ?? null
  const name = document.contact?.name ?? null
  if (number === null) return name ?? translate('occurrenceTripMap.stopDocumentWithoutNumber')
  return name === null
    ? translate('occurrenceTripMap.stopDocumentNumber', { number })
    : translate('occurrenceTripMap.stopDocument', { name, number })
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
    popup: [title, stop.label, ...documentLines(stop, translate)],
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
    const coordinates = coordinatesOf(stop)
    if (coordinates === null) continue
    pins.push(
      buildStopPin({
        coordinates,
        isNote: input.highlightNoteStop && isNote,
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
