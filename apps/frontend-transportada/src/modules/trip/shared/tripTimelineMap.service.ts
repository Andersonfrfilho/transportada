/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { TripTimelineItem } from './trip.types'
import {
  TIMELINE_MAP_CATEGORY_BY_KIND,
  TIMELINE_MAP_CELL_DECIMALS,
  TIMELINE_MAP_ICON_BY_CATEGORY,
  type TimelineMapCategory,
} from './tripTimelineMap.constant'
import { resolveTimelineLocationView } from './tripTimelineDetail.service'

export type TimelineMapPoint = Readonly<{
  category: TimelineMapCategory
  /** Quantos eventos da mesma categoria caíram neste lugar. */
  count: number
  icon: IconName
  key: string
  label: string
  latitude: number
  longitude: number
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
  latitude: number
  longitude: number
  occurredAt: string
}

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
      continue
    }
    const cluster: Cluster = {
      category: entry.category,
      count: 1,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      occurredAt: entry.item.occurredAt,
    }
    clusterByCellAndCategory.set(clusterKey, cluster)
    clusters.push(cluster)
  }
  return clusters
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

  const points = clusterPoints(located).map(
    (cluster, index): TimelineMapPoint => ({
      category: cluster.category,
      count: cluster.count,
      icon: TIMELINE_MAP_ICON_BY_CATEGORY[cluster.category],
      key: `timeline-map-${index + 1}`,
      label: translate(`eventTimeline.map.category.${cluster.category}`),
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      occurredAt: cluster.occurredAt,
      order: index + 1,
    }),
  )

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
