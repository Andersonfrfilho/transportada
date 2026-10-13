/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { AssemblyMapPoint } from './assemblyMap.service'
import {
  OCCURRENCE_TRIP_MAP_EVENT_PIN_KEY_PREFIX,
  OCCURRENCE_TRIP_MAP_OCCURRENCE_KINDS,
} from './occurrenceTripMap.constant'
import { resolveOccurrenceTripMapStops } from './occurrenceTripMapStops.service'
import { TIMELINE_EVENT_CATEGORY_COLOR } from './stopColor.service'
import type { TripStopDetail, TripTimelineItem } from './trip.types'
import {
  TIMELINE_MAP_CATEGORY_BY_KIND,
  TIMELINE_MAP_CELL_DECIMALS,
  TIMELINE_MAP_ICON_BY_CATEGORY,
  TIMELINE_MAP_PHOTO_ICON,
  TIMELINE_MAP_PHOTO_KIND,
  TIMELINE_MAP_PHOTO_LABEL_KEY,
  type TimelineMapCategory,
} from './tripTimelineMap.constant'
import {
  formatTripTimelineDistance,
  resolveTimelineLocationView,
} from './tripTimelineDetail.service'

export type OccurrenceTripMapPosition = 'captured' | 'expired' | 'restricted' | 'unavailable'

/** Uma linha da legenda: o evento, com ícone + palavra + cor, tenha ele pino ou não. */
export type OccurrenceTripMapEntry = Readonly<{
  category: TimelineMapCategory
  /** "a 35 m da parada" quando a API entrega a distância; o motivo em texto quando não há posição. */
  detail: null | string
  icon: IconName
  id: string
  isThisOccurrence: boolean
  label: string
  moment: string
  /** A vez do pino entre os eventos com posição; `null` quando o evento não tem posição. */
  order: null | number
  pinKey: null | string
  position: OccurrenceTripMapPosition
}>

export type OccurrenceTripMapNoteStop = Readonly<{
  label: string
  /** `null` quando a parada ainda não tem coordenada geocodificada. */
  pinKey: null | string
  sequence: number
}>

export type OccurrenceTripMapView = Readonly<{
  categories: readonly TimelineMapCategory[]
  entries: readonly OccurrenceTripMapEntry[]
  /** `stopsOnly`: leitor sem `trip.event-location` — nenhuma coordenada de evento chega ao mapa. */
  mode: 'events' | 'stopsOnly'
  noteStop: null | OccurrenceTripMapNoteStop
  occurrenceState: 'located' | 'not-found' | 'without-position'
  pins: readonly AssemblyMapPoint[]
  stopCount: number
  withoutPositionCount: number
}>

export type OccurrenceTripMapInput = Readonly<{
  canViewEventLocation: boolean
  formatMoment: (value: string) => string
  items: readonly TripTimelineItem[]
  occurrence: Readonly<{ id: string; stopLabel: null | string; tripDocumentId: null | string }>
  stops: readonly TripStopDetail[]
  translate: Translate
}>

type Located = Readonly<{
  category: TimelineMapCategory
  item: TripTimelineItem
  latitude: number
  longitude: number
}>

const CELL_SIZE_DEGREES = 10 ** -TIMELINE_MAP_CELL_DECIMALS

function isThisOccurrence(item: TripTimelineItem, occurrenceId: string): boolean {
  return (
    item.id === occurrenceId &&
    (OCCURRENCE_TRIP_MAP_OCCURRENCE_KINDS as readonly string[]).includes(item.kind)
  )
}

/** Eventos a poucos metros viram o mesmo ponto de ancoragem: o mapa abre os pinos em leque, não os empilha. */
function snapToAnchors(located: readonly Located[]): readonly Located[] {
  const anchors: { latitude: number; longitude: number }[] = []
  return located.map((entry) => {
    const anchor = anchors.find(
      (candidate) =>
        Math.abs(candidate.latitude - entry.latitude) < CELL_SIZE_DEGREES &&
        Math.abs(candidate.longitude - entry.longitude) < CELL_SIZE_DEGREES,
    )
    if (anchor !== undefined) return { ...entry, ...anchor }
    anchors.push({ latitude: entry.latitude, longitude: entry.longitude })
    return entry
  })
}

function labelOf(item: TripTimelineItem, category: TimelineMapCategory, translate: Translate) {
  return item.kind === TIMELINE_MAP_PHOTO_KIND
    ? translate(TIMELINE_MAP_PHOTO_LABEL_KEY)
    : translate(`eventTimeline.map.category.${category}`)
}

function iconOf(item: TripTimelineItem, category: TimelineMapCategory): IconName {
  return item.kind === TIMELINE_MAP_PHOTO_KIND
    ? TIMELINE_MAP_PHOTO_ICON
    : TIMELINE_MAP_ICON_BY_CATEGORY[category]
}

function distanceOf(item: TripTimelineItem, translate: Translate): null | string {
  const meters = item.location?.distanceMeters ?? null
  if (meters === null) return null
  const distance = formatTripTimelineDistance(meters)
  return translate(`occurrenceTripMap.distance.${distance.unit}`, { distance: distance.value })
}

function sortChronologically(items: readonly TripTimelineItem[]): readonly TripTimelineItem[] {
  return [...items].sort((first, second) => first.occurredAt.localeCompare(second.occurredAt))
}

function buildEventPin(
  input: Readonly<{
    entry: OccurrenceTripMapEntry
    located: Located
    translate: Translate
  }>,
): AssemblyMapPoint {
  const { entry, located, translate } = input
  const title = entry.isThisOccurrence ? translate('occurrenceTripMap.thisOccurrence') : entry.label
  return {
    ariaLabel: translate('occurrenceTripMap.pinLabel', {
      label: title,
      moment: entry.moment,
      order: entry.order,
    }),
    cityCode: '',
    color: TIMELINE_EVENT_CATEGORY_COLOR[entry.category],
    glyph: entry.icon,
    isApproximate: false,
    isHighlighted: entry.isThisOccurrence,
    label: title,
    latitude: located.latitude,
    longitude: located.longitude,
    notes: [],
    orderBadge: String(entry.order),
    popup: [
      `${String(entry.order)}. ${title}`,
      entry.moment,
      ...(entry.detail === null ? [] : [entry.detail]),
    ],
    sequence: entry.order,
    stopKey: entry.pinKey ?? '',
    x: located.longitude,
    y: located.latitude,
  }
}

function buildEvents(input: OccurrenceTripMapInput) {
  const entries: OccurrenceTripMapEntry[] = []
  const located: Located[] = []
  for (const item of sortChronologically(input.items)) {
    const category = TIMELINE_MAP_CATEGORY_BY_KIND[item.kind]
    if (category === null) continue
    const view = resolveTimelineLocationView(item, input.translate)
    if (view === null) continue
    const coordinates = view.coordinates
    const base = {
      category,
      icon: iconOf(item, category),
      id: item.id,
      isThisOccurrence: isThisOccurrence(item, input.occurrence.id),
      label: labelOf(item, category, input.translate),
      moment: input.formatMoment(item.occurredAt),
    }
    if (coordinates === null) {
      entries.push({
        ...base,
        detail: input.translate(`occurrenceTripMap.withoutPosition.${view.kind}`),
        order: null,
        pinKey: null,
        position: view.kind,
      })
      continue
    }
    const order = located.length + 1
    located.push({ category, item, ...coordinates })
    entries.push({
      ...base,
      detail: distanceOf(item, input.translate),
      order,
      pinKey: `${OCCURRENCE_TRIP_MAP_EVENT_PIN_KEY_PREFIX}${String(order)}`,
      position: 'captured',
    })
  }
  return { entries, located: snapToAnchors(located) }
}

/** Parada da nota fica no fim: o último marcador desenhado é o que fica por cima. */
function orderPins(pins: readonly AssemblyMapPoint[]): readonly AssemblyMapPoint[] {
  const base = pins.filter((pin) => pin.isHighlighted !== true)
  const highlighted = pins.filter((pin) => pin.isHighlighted === true)
  return [...base, ...highlighted]
}

function resolveOccurrenceState(
  entries: readonly OccurrenceTripMapEntry[],
): OccurrenceTripMapView['occurrenceState'] {
  const own = entries.find((entry) => entry.isThisOccurrence)
  if (own === undefined) return 'not-found'
  return own.position === 'captured' ? 'located' : 'without-position'
}

/**
 * O mapa da ocorrência: os eventos da viagem com posição, numerados pela ordem em que aconteceram, a
 * ocorrência em destaque e a parada da nota. ⚠️ Sem `trip.event-location` a coordenada de evento nem é
 * lida — o mapa vira "só paradas", ainda que a API mandasse o ponto.
 */
export function buildOccurrenceTripMapView(input: OccurrenceTripMapInput): OccurrenceTripMapView {
  const own = input.items.find((item) => isThisOccurrence(item, input.occurrence.id))
  const stops = resolveOccurrenceTripMapStops({
    drawAllStops: !input.canViewEventLocation,
    noteStopId: own?.stop?.id ?? null,
    occurrence: input.occurrence,
    stops: input.stops,
    translate: input.translate,
  })

  if (!input.canViewEventLocation) {
    return {
      categories: [],
      entries: [],
      mode: 'stopsOnly',
      noteStop: stops.noteStop,
      occurrenceState: 'not-found',
      pins: stops.pins,
      stopCount: stops.pins.length,
      withoutPositionCount: 0,
    }
  }

  const { entries, located } = buildEvents(input)
  const eventPins = entries.flatMap((entry) => {
    const point = located[(entry.order ?? 0) - 1]
    return entry.order === null || point === undefined
      ? []
      : [buildEventPin({ entry, located: point, translate: input.translate })]
  })
  const categories = [
    ...new Set(entries.filter((entry) => entry.order !== null).map((entry) => entry.category)),
  ]

  return {
    categories,
    entries,
    mode: 'events',
    noteStop: stops.noteStop,
    occurrenceState: resolveOccurrenceState(entries),
    pins: orderPins([...stops.pins, ...eventPins]),
    stopCount: stops.pins.length,
    withoutPositionCount: entries.filter((entry) => entry.order === null).length,
  }
}
