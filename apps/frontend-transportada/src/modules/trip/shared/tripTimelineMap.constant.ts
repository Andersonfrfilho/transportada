/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'

import type { TripTimelineKind } from './trip.types'

export const TIMELINE_MAP_CATEGORIES = [
  'dispatched',
  'arrived',
  'departed',
  'delivered',
  'returned',
  'occurrence',
  'cancelled',
  'status',
] as const
export type TimelineMapCategory = (typeof TIMELINE_MAP_CATEGORIES)[number]

export const TIMELINE_MAP_CATEGORY_BY_KIND: Readonly<
  Record<TripTimelineKind, TimelineMapCategory>
> = {
  'document.delivered': 'delivered',
  'document.occurrence': 'occurrence',
  'document.returned': 'returned',
  'document.status_changed': 'status',
  'stop.arrived': 'arrived',
  'stop.departed': 'departed',
  'stop.departure_cancelled': 'cancelled',
  'stop.occurrence': 'occurrence',
  'trip.created': 'status',
  'trip.dispatched': 'dispatched',
  'trip.status_changed': 'status',
}

/** Os mesmos glifos da linha da lista: o pino e a linha ao lado dele dizem a mesma coisa. */
export const TIMELINE_MAP_ICON_BY_CATEGORY: Readonly<Record<TimelineMapCategory, IconName>> = {
  arrived: 'map-pin',
  cancelled: 'close',
  delivered: 'check',
  departed: 'truck',
  dispatched: 'send',
  occurrence: 'alert',
  returned: 'refresh',
  status: 'clock',
}

/** ~11 m: pinos do mesmo lugar viram um só (mesma categoria) ou abrem em leque (categorias distintas). */
export const TIMELINE_MAP_CELL_DECIMALS = 4

/** Acima disto a lista acessível recolhe: dezenas de linhas empurrariam a linha do tempo para fora da tela. */
export const TIMELINE_MAP_LIST_COLLAPSE_THRESHOLD = 8

/** Abaixo de dois lugares não há trecho para pedir — a API responderia 400. */
export const TIMELINE_ROUTE_MIN_POINTS = 2

/** Espelho de `MAX_ROUTE_GEOMETRY_POINTS` da API: pedir acima disto só renderia 400. */
export const TIMELINE_ROUTE_MAX_POINTS = 100

/** O que o mapa desenhou entre um ponto e o seguinte. */
export type TimelineRouteTrace = 'none' | 'road' | 'straight'

/**
 * ⚠️ A legenda é **consequência** do traço, nunca texto fixo: um tracejado reto não pode ser
 * anunciado como caminho pela estrada (ADR-0044 §5).
 */
export const TIMELINE_MAP_CAPTION_KEY_BY_TRACE: Readonly<Record<TimelineRouteTrace, string>> = {
  none: 'eventTimeline.map.captionPoint',
  road: 'eventTimeline.map.captionRoad',
  straight: 'eventTimeline.map.captionStraight',
}
