/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { AssemblyMapPoint } from './assemblyMap.service'
import type { TripTimelineItem } from './trip.types'
import {
  TIMELINE_MAP_CATEGORY_BY_KIND,
  TIMELINE_MAP_CELL_DECIMALS,
  TIMELINE_MAP_ICON_BY_CATEGORY,
  TIMELINE_MAP_LEG_LABEL_MIN_MINUTES,
  type TimelineMapCategory,
} from './tripTimelineMap.constant'
import { resolveTimelineLocationView } from './tripTimelineDetail.service'
import { formatTripTimelineDuration } from './tripTimelineRow.service'

export type TimelineMapPoint = Readonly<{
  category: TimelineMapCategory
  /** Quantos eventos da mesma categoria caíram neste lugar. */
  count: number
  icon: IconName
  /**
   * Spec 196 — o tempo até aqui, já escrito: **o mesmo** `formatTripTimelineDuration` da lista, para
   * esta base não ganhar um segundo jeito de dizer "2 h 15 min". `null` no primeiro ponto.
   */
  intervalLabel: null | string
  key: string
  label: string
  /** O último instante do grupo — de onde se mede o tempo até o ponto seguinte. */
  lastOccurredAt: string
  latitude: number
  longitude: number
  /**
   * Minutos do **último** evento do ponto anterior até o **primeiro** deste. `null` no primeiro
   * ponto, onde não há de onde medir.
   */
  minutesFromPrevious: null | number
  /** O primeiro instante do grupo — a ordem cronológica do traço. */
  occurredAt: string
  /** 1-based, na ordem do traço. */
  order: number
}>

export type TimelineMapMissing = Readonly<{
  expired: number
  restricted: number
  unavailable: number
}>

export type TimelineMapView = Readonly<{
  categories: readonly Readonly<{ category: TimelineMapCategory; count: number }>[]
  /** Eventos com ponto no mapa (antes de agrupar). */
  locatedCount: number
  missing: TimelineMapMissing
  missingCount: number
  points: readonly TimelineMapPoint[]
}>

type Cluster = {
  category: TimelineMapCategory
  count: number
  lastOccurredAt: string
  latitude: number
  longitude: number
  occurredAt: string
}

const MILLISECONDS_PER_MINUTE = 60_000

type LocatedEntry = Readonly<{
  category: TimelineMapCategory
  item: TripTimelineItem
  latitude: number
  longitude: number
}>

const CELL_SIZE_DEGREES = 10 ** -TIMELINE_MAP_CELL_DECIMALS

// Arredondar para uma grade separa pontos a 5 m quando caem em lados opostos da fronteira da célula.
function findAnchorKey(
  anchors: ReadonlyMap<string, Readonly<{ latitude: number; longitude: number }>>,
  entry: Readonly<{ latitude: number; longitude: number }>,
): string | undefined {
  for (const [key, anchor] of anchors) {
    const isSamePlace =
      Math.abs(anchor.latitude - entry.latitude) < CELL_SIZE_DEGREES &&
      Math.abs(anchor.longitude - entry.longitude) < CELL_SIZE_DEGREES
    if (isSamePlace) return key
  }
  return undefined
}

function sortChronologically(items: readonly TripTimelineItem[]): readonly TripTimelineItem[] {
  return [...items].sort((first, second) => first.occurredAt.localeCompare(second.occurredAt))
}

/**
 * ⚠️ Mesma célula e mesma categoria viram **um** pino com contagem; células iguais de categorias
 * distintas ganham a coordenada do primeiro, para o mapa abri-las em leque pela chave exata.
 */
function clusterPoints(located: readonly LocatedEntry[]): readonly Cluster[] {
  const clusters: Cluster[] = []
  const anchorByCell = new Map<string, Readonly<{ latitude: number; longitude: number }>>()
  const clusterByCellAndCategory = new Map<string, Cluster>()

  for (const entry of located) {
    const cell = findAnchorKey(anchorByCell, entry) ?? `${entry.latitude}:${entry.longitude}`
    const anchor = anchorByCell.get(cell) ?? {
      latitude: entry.latitude,
      longitude: entry.longitude,
    }
    anchorByCell.set(cell, anchor)
    const clusterKey = `${cell}|${entry.category}`
    const existing = clusterByCellAndCategory.get(clusterKey)
    if (existing !== undefined) {
      existing.count += 1
      /** A entrada vem em ordem cronológica, então o último visto é o último do grupo. */
      existing.lastOccurredAt = entry.item.occurredAt
      continue
    }
    const cluster: Cluster = {
      category: entry.category,
      count: 1,
      lastOccurredAt: entry.item.occurredAt,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      occurredAt: entry.item.occurredAt,
    }
    clusterByCellAndCategory.set(clusterKey, cluster)
    clusters.push(cluster)
  }
  return clusters
}

/**
 * ⚠️ **Do último evento do grupo anterior até o primeiro deste.** Medir do primeiro ao primeiro
 * somaria o tempo parado dentro do grupo ao tempo de deslocamento, e o rótulo sobre o traço passaria
 * a anunciar um intervalo que o traço não percorreu.
 */
function minutesBetweenClusters(previous: Cluster | undefined, current: Cluster): null | number {
  if (previous === undefined) return null
  const difference = Date.parse(current.occurredAt) - Date.parse(previous.lastOccurredAt)
  if (Number.isNaN(difference) || difference < 0) return null
  return Math.round(difference / MILLISECONDS_PER_MINUTE)
}

/**
 * Spec 196 — o pino da linha do tempo como o mapa o recebe.
 *
 * ⚠️ **O ícone do evento continua sendo o do evento**: o número da ordem é marca *adicional*, no
 * canto, nunca substituta do glifo — é o glifo que diz o tipo, e o selo que diz a vez.
 *
 * ⚠️ **O selo traz um número só, nunca uma faixa.** A numeração conta *pinos*, e `1–3` falaria de
 * uma numeração de eventos que não existe em lugar nenhum da tela. Quantos eventos estão ali embaixo
 * continua sendo trabalho do selo de contagem, do outro canto — o selo de ordem não o repete nem o
 * contradiz.
 */
export function buildTimelineMapPin(
  point: TimelineMapPoint,
  translate: Translate,
): AssemblyMapPoint {
  return {
    ariaLabel: translate('eventTimeline.map.pinLabel', {
      count: point.count,
      label: point.label,
      order: point.order,
    }),
    cityCode: '',
    count: point.count,
    glyph: point.icon,
    isApproximate: false,
    label: point.label,
    latitude: point.latitude,
    longitude: point.longitude,
    notes: [],
    orderBadge: String(point.order),
    sequence: point.order,
    stopKey: point.key,
    x: point.longitude,
    y: point.latitude,
  }
}

export function resolveTimelineMapView(
  items: readonly TripTimelineItem[],
  translate: Translate,
): TimelineMapView {
  const located: LocatedEntry[] = []
  const missing = { expired: 0, restricted: 0, unavailable: 0 }

  for (const item of sortChronologically(items)) {
    const view = resolveTimelineLocationView(item, translate)
    if (view === null) continue
    if (view.coordinates === null) {
      if (view.kind !== 'captured') missing[view.kind] += 1
      continue
    }
    located.push({
      category: TIMELINE_MAP_CATEGORY_BY_KIND[item.kind],
      item,
      latitude: view.coordinates.latitude,
      longitude: view.coordinates.longitude,
    })
  }

  const clusters = clusterPoints(located)
  const points = clusters.map((cluster, index): TimelineMapPoint => {
    const minutesFromPrevious = minutesBetweenClusters(clusters[index - 1], cluster)
    return {
      category: cluster.category,
      count: cluster.count,
      icon: TIMELINE_MAP_ICON_BY_CATEGORY[cluster.category],
      intervalLabel:
        minutesFromPrevious === null
          ? null
          : formatTripTimelineDuration(minutesFromPrevious, translate),
      key: `timeline-map-${index + 1}`,
      label: translate(`eventTimeline.map.category.${cluster.category}`),
      lastOccurredAt: cluster.lastOccurredAt,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      minutesFromPrevious,
      occurredAt: cluster.occurredAt,
      order: index + 1,
    }
  })

  const countByCategory = new Map<TimelineMapCategory, number>()
  for (const entry of located) {
    countByCategory.set(entry.category, (countByCategory.get(entry.category) ?? 0) + 1)
  }

  return {
    categories: [...countByCategory].map(([category, count]) => ({ category, count })),
    locatedCount: located.length,
    missing,
    missingCount: missing.expired + missing.restricted + missing.unavailable,
    points,
  }
}

/** Um rótulo de tempo pronto para o mapa: o texto curto no desenho, a frase inteira na leitura. */
export type TimelineLegLabelContent = Readonly<{ aria: string; text: string }>

export type TimelineLegLabelPlacement = Readonly<{
  /** Onde o rótulo se deita quando o traço o comporta — o meio do que foi desenhado. */
  anchor: Readonly<{ x: number; y: number }>
  content: TimelineLegLabelContent
  /** Os dois pinos que o rótulo separa; é a distância entre eles que decide a âncora. */
  from: Readonly<{ x: number; y: number }>
  to: Readonly<{ x: number; y: number }>
  toSequence: number
}>

/**
 * Spec 196 — o que o mapa escreve sobre o trecho que chega a este ponto.
 *
 * ⚠️ O texto é o da lista, pelo mesmo `formatTripTimelineDuration`; o que muda é **o que o mapa cala**:
 * abaixo de `TIMELINE_MAP_LEG_LABEL_MIN_MINUTES` não há espaçamento a mostrar, e a pílula só ocuparia
 * o traço que ela mesma diz ser curto. O primeiro ponto não tem anterior e nunca carrega rótulo.
 */
export function resolveTimelineLegLabelText(
  point: TimelineMapPoint | undefined,
  translate: Translate,
): TimelineLegLabelContent | undefined {
  const minutes = point?.minutesFromPrevious ?? null
  if (point === undefined || minutes === null || point.intervalLabel === null) return undefined
  if (minutes < TIMELINE_MAP_LEG_LABEL_MIN_MINUTES) return undefined

  return {
    aria: translate('eventTimeline.map.legInterval', { duration: point.intervalLabel }),
    text: point.intervalLabel,
  }
}

/**
 * Um rótulo por **par consecutivo da cronologia** — e não um por trecho desenhado.
 *
 * ⚠️ **Era essa a troca que perdia rótulo na tela.** Quando dois eventos caem no mesmo lugar, o corte
 * da polilinha devolve um trecho de um ponto só e `resolveRouteLegs` o descarta; quem contava trechos
 * para contar rótulos perdia o tempo daquele par para sempre. Medido: quatro pinos, três pares, dois
 * rótulos. O traço continua mandando **onde** o rótulo ancora, nunca **se** ele existe — sem traço
 * cortado, a âncora é o meio da reta entre os dois pinos.
 */
export function resolveTimelineLegLabels(
  input: Readonly<{
    content: (sequence: number) => TimelineLegLabelContent | undefined
    legPoints: ReadonlyMap<number, readonly Readonly<{ x: number; y: number }>[]>
    points: readonly Readonly<{ latitude: number; longitude: number; sequence: number }>[]
  }>,
): readonly TimelineLegLabelPlacement[] {
  const placements: TimelineLegLabelPlacement[] = []

  for (const [index, point] of input.points.entries()) {
    const previous = input.points[index - 1]
    if (previous === undefined) continue

    const content = input.content(point.sequence)
    if (content === undefined) continue

    const from = { x: previous.longitude, y: previous.latitude }
    const to = { x: point.longitude, y: point.latitude }
    placements.push({
      anchor: midpointOfDrawnLeg(input.legPoints.get(point.sequence)) ?? midpointBetween(from, to),
      content,
      from,
      to,
      toSequence: point.sequence,
    })
  }

  return placements
}

/** O meio do traço desenhado — não o meio da reta entre as pontas, que sairia de cima dele. */
function midpointOfDrawnLeg(
  points: readonly Readonly<{ x: number; y: number }>[] | undefined,
): Readonly<{ x: number; y: number }> | null {
  if (points === undefined || points.length < 2) return null

  return points[Math.floor(points.length / 2)] ?? null
}

function midpointBetween(
  first: Readonly<{ x: number; y: number }>,
  second: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}
