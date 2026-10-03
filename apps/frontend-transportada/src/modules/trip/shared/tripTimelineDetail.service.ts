/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import {
  TRIP_TIMELINE_DISTANCE_COARSE_FRACTION_DIGITS,
  TRIP_TIMELINE_DISTANCE_COARSE_KILOMETER_THRESHOLD_METERS,
  TRIP_TIMELINE_DISTANCE_KILOMETER_THRESHOLD_METERS,
  TRIP_TIMELINE_DISTANCE_PRECISE_FRACTION_DIGITS,
  TRIP_TIMELINE_LOCATION_COORDINATE_DIGITS,
  TRIP_TIMELINE_LOCATION_LINE_SEPARATOR,
  TRIP_TIMELINE_METERS_PER_KILOMETER,
} from './trip.constant'
import type { TripTimelineItem } from './trip.types'

export type TripTimelineDistanceLabel = Readonly<{
  unit: 'kilometers' | 'meters'
  value: string
}>

/**
 * Spec 196: escolhe a unidade antes de escolher a frase. A unidade muda a frase inteira — por isso
 * devolve a chave do locale junto com o número, e não um texto pronto: "a 208 km do ponto" e
 * "a 850 m do ponto" são duas sentenças, não a mesma com o número trocado.
 */
export function formatTripTimelineDistance(meters: number): TripTimelineDistanceLabel {
  if (meters < TRIP_TIMELINE_DISTANCE_KILOMETER_THRESHOLD_METERS) {
    return { unit: 'meters', value: String(Math.round(meters)) }
  }

  const fractionDigits =
    meters < TRIP_TIMELINE_DISTANCE_COARSE_KILOMETER_THRESHOLD_METERS
      ? TRIP_TIMELINE_DISTANCE_PRECISE_FRACTION_DIGITS
      : TRIP_TIMELINE_DISTANCE_COARSE_FRACTION_DIGITS
  const kilometers = meters / TRIP_TIMELINE_METERS_PER_KILOMETER
  return {
    unit: 'kilometers',
    value: kilometers.toLocaleString('pt-BR', {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }),
  }
}

export type TripTimelineLocationView = Readonly<{
  canViewMap: boolean
  coordinates: null | Readonly<{ latitude: number; longitude: number }>
  icon: IconName
  kind: 'captured' | 'expired' | 'restricted' | 'unavailable'
  label: string
  lines: readonly string[]
  /** `address` é o ponto novo do endereço corrigido; `device` é a posição que o aparelho carimbou. */
  pin: 'address' | 'device'
  tone: 'neutral' | 'problem'
  tooltip: string
}>

const locationMomentFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatLocationMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : locationMomentFormatter.format(moment)
}

/**
 * Spec 228 D7: o endereço corrigido chega com ponto e sem `locationState` ("não se aplica": não é
 * posição de pessoa). Com o ponto na mão ele se lê como capturado; sem ele, continua sem nada.
 */
function resolveLocationState(item: TripTimelineItem): TripTimelineItem['locationState'] {
  const isAddressPoint =
    item.kind === 'stop.address_corrected' &&
    (item.locationState === undefined || item.locationState === null) &&
    item.location !== undefined &&
    item.location !== null
  return isAddressPoint ? 'captured' : item.locationState
}

function hasReadableCoordinate(item: TripTimelineItem): boolean {
  return (
    resolveLocationState(item) === 'captured' &&
    item.location !== undefined &&
    item.location !== null
  )
}

function buildLocationView(
  input: Pick<TripTimelineLocationView, 'canViewMap' | 'coordinates' | 'icon' | 'kind' | 'tone'> &
    Readonly<{
      lines: readonly string[]
      pin?: TripTimelineLocationView['pin']
      translate: Translate
    }>,
): TripTimelineLocationView {
  const { pin = 'device', translate, ...view } = input
  return {
    ...view,
    pin,
    label: translate(`eventTimeline.location.label.${view.kind}`),
    tooltip: view.lines.join(TRIP_TIMELINE_LOCATION_LINE_SEPARATOR),
  }
}

/**
 * Spec 196 T6.2 / ADR-0081 §6.1: a regra inteira das cinco situações do ponto do evento. `null`
 * significa "não se aplica" — o toque nunca foi construído para carimbar posição — e **não desenha
 * nada**: pintar aqui diria que o GPS falhou quando o que falta é a Fase 3 da spec. Só `unavailable`
 * é vermelho; `captured` sem coordenada é o leitor sem `trip.event-location` (o GPS funcionou).
 */
export function resolveTimelineLocationView(
  item: TripTimelineItem,
  translate: Translate,
): null | TripTimelineLocationView {
  const { location } = item
  const locationState = resolveLocationState(item)
  if (locationState === undefined || locationState === null) return null

  if (locationState === 'unavailable') {
    return buildLocationView({
      canViewMap: false,
      coordinates: null,
      icon: 'map-pin-off',
      kind: 'unavailable',
      lines: [translate('eventTimeline.location.unavailable')],
      tone: 'problem',
      translate,
    })
  }

  if (locationState === 'expired') {
    return buildLocationView({
      canViewMap: false,
      coordinates: null,
      icon: 'map-pin',
      kind: 'expired',
      lines: [translate('eventTimeline.location.expired')],
      tone: 'neutral',
      translate,
    })
  }

  if (location === undefined || location === null) {
    return buildLocationView({
      canViewMap: false,
      coordinates: null,
      icon: 'map-pin',
      kind: 'restricted',
      lines: [translate('eventTimeline.location.restricted')],
      tone: 'neutral',
      translate,
    })
  }

  const lines: string[] = []
  if (location.accuracyMeters !== null) {
    lines.push(
      translate('eventTimeline.location.accuracy', { meters: Math.round(location.accuracyMeters) }),
    )
  }
  if (location.distanceMeters !== null) {
    const distance = formatTripTimelineDistance(location.distanceMeters)
    lines.push(
      translate(`eventTimeline.location.distance.${distance.unit}`, { distance: distance.value }),
    )
  }
  const isAddressPoint = item.kind === 'stop.address_corrected'
  lines.push(
    translate('eventTimeline.location.coordinates', {
      latitude: location.latitude.toFixed(TRIP_TIMELINE_LOCATION_COORDINATE_DIGITS),
      longitude: location.longitude.toFixed(TRIP_TIMELINE_LOCATION_COORDINATE_DIGITS),
    }),
    translate(
      isAddressPoint
        ? 'eventTimeline.location.addressCorrectedAt'
        : 'eventTimeline.location.capturedAt',
      { moment: formatLocationMoment(location.capturedAt) },
    ),
  )
  return buildLocationView({
    canViewMap: true,
    coordinates: { latitude: location.latitude, longitude: location.longitude },
    icon: 'map-pin',
    kind: 'captured',
    lines,
    pin: isAddressPoint ? 'address' : 'device',
    tone: 'neutral',
    translate,
  })
}

/**
 * Spec 180 RF16/RF17 (CA14/CA16): só oferece expandir quando o item tem algo a mostrar além de
 * título, hora e autoria — motivo da devolução, motivo do encerramento, observação ou foto da
 * ocorrência. Um controle que abre o vazio é pior que nenhum controle. Espelha as mesmas condições
 * que `TripTimeline.component.tsx` já usava para desenhar cada detalhe, só que testável sozinha e
 * reaproveitável para decidir se o botão de expandir aparece.
 */
export function hasTripTimelineExpandableDetail(item: TripTimelineItem): boolean {
  if (hasReadableCoordinate(item)) return true

  if (item.kind === 'document.returned' && item.returnReason !== null && item.returnReason !== '') {
    return true
  }

  if (
    item.kind === 'trip.status_changed' &&
    item.toStatus === 'completed' &&
    item.closeReason !== null &&
    item.closeReason !== ''
  ) {
    return true
  }

  if (item.kind === 'stop.occurrence' || item.kind === 'document.occurrence') {
    if (item.occurrence === null) return false
    const hasNote = item.occurrence.note !== ''
    const hasAttachments =
      item.occurrence.attachmentCount !== undefined && item.occurrence.attachmentCount > 0
    return hasNote || hasAttachments
  }

  return false
}
