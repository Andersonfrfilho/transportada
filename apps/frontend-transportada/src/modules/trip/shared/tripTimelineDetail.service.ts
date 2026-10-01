/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import {
  TRIP_TIMELINE_LOCATION_COORDINATE_DIGITS,
  TRIP_TIMELINE_LOCATION_LINE_SEPARATOR,
} from './trip.constant'
import type { TripTimelineItem } from './trip.types'

export type TripTimelineLocationView = Readonly<{
  canViewMap: boolean
  coordinates: null | Readonly<{ latitude: number; longitude: number }>
  icon: IconName
  kind: 'captured' | 'expired' | 'restricted' | 'unavailable'
  label: string
  lines: readonly string[]
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

function hasReadableCoordinate(item: TripTimelineItem): boolean {
  return item.locationState === 'captured' && item.location !== undefined && item.location !== null
}

function buildLocationView(
  input: Pick<TripTimelineLocationView, 'canViewMap' | 'coordinates' | 'icon' | 'kind' | 'tone'> &
    Readonly<{ lines: readonly string[]; translate: Translate }>,
): TripTimelineLocationView {
  const { translate, ...view } = input
  return {
    ...view,
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
  const { location, locationState } = item
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
    lines.push(
      translate('eventTimeline.location.distance', { meters: Math.round(location.distanceMeters) }),
    )
  }
  lines.push(
    translate('eventTimeline.location.coordinates', {
      latitude: location.latitude.toFixed(TRIP_TIMELINE_LOCATION_COORDINATE_DIGITS),
      longitude: location.longitude.toFixed(TRIP_TIMELINE_LOCATION_COORDINATE_DIGITS),
    }),
    translate('eventTimeline.location.capturedAt', {
      moment: formatLocationMoment(location.capturedAt),
    }),
  )
  return buildLocationView({
    canViewMap: true,
    coordinates: { latitude: location.latitude, longitude: location.longitude },
    icon: 'map-pin',
    kind: 'captured',
    lines,
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
