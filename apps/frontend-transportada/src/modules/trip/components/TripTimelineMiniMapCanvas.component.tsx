/* Copyright (c) 2026 Ada Technology. MIT License. */
import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import type { RouteGeometry } from '../shared/routeGeometry.service'
import { TIMELINE_EVENT_CATEGORY_COLOR } from '../shared/stopColor.service'
import {
  buildTimelineMapPin,
  resolveTimelineLegLabelText,
  type TimelineMapPoint,
} from '../shared/tripTimelineMap.service'
import styles from '../styles/tripTimelineMiniMap.module.css'

/** O mesmo mapa do `TripRouteMap`, e pelo mesmo motivo `lazy`: fora dele o precache do PWA estoura. */
const AssemblyVectorMap = lazy(async () => ({
  default: (await import('./AssemblyVectorMap.component')).AssemblyVectorMap,
}))

const MAP_HEIGHT = '18rem'
const NO_NEARBY: readonly AssemblyMapPoint[] = []

type TripTimelineMiniMapCanvasProps = Readonly<{
  /** A estrada entre os eventos; `null` enquanto a resposta não vem, ou quando não há rota. */
  geometry: null | RouteGeometry
  onBasemapMissing: () => void
  points: readonly TimelineMapPoint[]
}>

/** As coordenadas só vão ao mapa em memória — nenhuma URL, nenhum tile de terceiro (ADR-0044 §6). */
export function TripTimelineMiniMapCanvas({
  geometry,
  onBasemapMissing,
  points,
}: TripTimelineMiniMapCanvasProps) {
  const { t } = useTranslation('trip')
  const mapPoints: readonly AssemblyMapPoint[] = useMemo(
    () => points.map((point) => buildTimelineMapPin(point, t as Translate)),
    [points, t],
  )
  const pinColor = useMemo(() => {
    const colors = points.map((point) => TIMELINE_EVENT_CATEGORY_COLOR[point.category])
    return (sequence: number): string =>
      colors[sequence - 1] ?? TIMELINE_EVENT_CATEGORY_COLOR.status
  }, [points])
  /**
   * O trecho que chega ao ponto `toSequence` leva o tempo que se passou desde o ponto anterior —
   * texto já escrito pelo formatador da lista, nunca remontado aqui, e calado abaixo de um minuto.
   */
  const legLabel = useMemo(() => {
    const byOrder = new Map(points.map((point) => [point.order, point]))
    return (toSequence: number) =>
      resolveTimelineLegLabelText(byOrder.get(toSequence), t as Translate)
  }, [points, t])

  return (
    <Suspense
      fallback={
        <SkeletonGroup label={t('eventTimeline.map.loading')}>
          <Skeleton height={MAP_HEIGHT} variant="block" />
        </SkeletonGroup>
      }
    >
      <div className={styles.canvas}>
        <AssemblyVectorMap
          isQuietBasemap
          geometry={geometry}
          legLabel={legLabel}
          nearby={NO_NEARBY}
          onBasemapMissing={onBasemapMissing}
          points={mapPoints}
          stopColor={pinColor}
        />
      </div>
    </Suspense>
  )
}
