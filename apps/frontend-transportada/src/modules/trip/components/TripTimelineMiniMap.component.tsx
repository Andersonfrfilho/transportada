/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { TripTimelineItem } from '../shared/trip.types'
import {
  TIMELINE_MAP_CAPTION_KEY_BY_TRACE,
  TIMELINE_MAP_ICON_BY_CATEGORY,
} from '../shared/tripTimelineMap.constant'
import {
  resolveTimelineMapView,
  type TimelineMapMissing,
  type TimelineMapPoint,
} from '../shared/tripTimelineMap.service'
import {
  createTimelineRouteGeometryQueryOptions,
  resolveTimelineRouteTrace,
} from '../shared/tripTimelineRoute.service'
import styles from '../styles/tripTimelineMiniMap.module.css'

import { TripTimelineMiniMapCanvas } from './TripTimelineMiniMapCanvas.component'

type TripTimelineMiniMapProps = Readonly<{
  /** Há mais páginas na API: o mapa mostra só o que já foi carregado, e diz isso. */
  hasMorePages: boolean
  items: readonly TripTimelineItem[]
}>

const MISSING_KEYS = [
  ['unavailable', 'missingUnavailable'],
  ['expired', 'missingExpired'],
  ['restricted', 'missingRestricted'],
] as const satisfies readonly (readonly [keyof TimelineMapMissing, string])[]

function formatPointMoment(value: string, language: string): string {
  const moment = new Date(value)
  if (Number.isNaN(moment.getTime())) return value
  return new Intl.DateTimeFormat(language, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(moment)
}

export function TripTimelineMiniMap({ hasMorePages, items }: TripTimelineMiniMapProps) {
  const { i18n, t } = useTranslation('trip')
  const [hasBasemap, setHasBasemap] = useState(true)
  const view = useMemo(() => resolveTimelineMapView(items, t as Translate), [items, t])
  // Rota indisponível não vira erro na tela: o traço volta a ser a reta tracejada, e a legenda diz isso.
  const routeQuery = useQuery(
    createTimelineRouteGeometryQueryOptions({ client: getTripClient(), points: view.points }),
  )
  const geometry = routeQuery.data ?? null
  const trace = resolveTimelineRouteTrace({ geometry, points: view.points })

  /**
   * ⚠️ É aqui que a ordem e o tempo entre pontos **nunca** se perdem: o selo no pino pode ficar
   * pequeno e o rótulo de tempo recolhe no trecho curto, mas a linha da lista sai inteira sempre.
   */
  function renderPointLine(point: TimelineMapPoint): string {
    const moment = formatPointMoment(point.occurredAt, i18n.language)
    const line =
      point.count > 1
        ? t('eventTimeline.map.listItemGrouped', {
            count: point.count,
            label: point.label,
            moment,
            order: point.order,
          })
        : t('eventTimeline.map.listItem', { label: point.label, moment, order: point.order })
    if (point.intervalLabel === null) return line
    return `${line} ${t('eventTimeline.map.listItemInterval', { duration: point.intervalLabel })}`
  }

  return (
    <section aria-labelledby="trip-timeline-map-title" className={styles.miniMap}>
      <h4 id="trip-timeline-map-title">{t('eventTimeline.map.title')}</h4>
      {view.points.length === 0 ? (
        <p className={styles.note}>{t('eventTimeline.map.empty')}</p>
      ) : (
        <>
          {hasBasemap ? (
            <TripTimelineMiniMapCanvas
              geometry={geometry}
              onBasemapMissing={() => setHasBasemap(false)}
              points={view.points}
            />
          ) : (
            <p className={styles.note}>{t('eventTimeline.map.mapMissing')}</p>
          )}
          <ul aria-label={t('eventTimeline.map.legendLabel')} className={styles.legend}>
            {view.categories.map(({ category, count }) => (
              <li className={styles.legendItem} key={category}>
                <span className={`${styles.swatch ?? ''} ${styles[category] ?? ''}`}>
                  <Icon name={TIMELINE_MAP_ICON_BY_CATEGORY[category]} />
                </span>
                {t('eventTimeline.map.legendItem', {
                  count,
                  label: t(`eventTimeline.map.category.${category}`),
                })}
              </li>
            ))}
          </ul>
          <p className={styles.note}>{t(TIMELINE_MAP_CAPTION_KEY_BY_TRACE[trace])}</p>
          {/* O que o selo e o rótulo de tempo significam — a imagem não explica a si mesma. */}
          <p className={styles.note}>{t('eventTimeline.map.captionInterval')}</p>
          <details className={styles.pointList}>
            <summary className={styles.pointListSummary}>
              {t('eventTimeline.map.listSummary', { count: view.points.length })}
            </summary>
            <ol className={styles.pointListItems}>
              {view.points.map((point) => (
                <li key={point.key}>{renderPointLine(point)}</li>
              ))}
            </ol>
          </details>
        </>
      )}
      {hasMorePages ? <p className={styles.note}>{t('eventTimeline.map.partial')}</p> : null}
      {MISSING_KEYS.map(([state, key]) =>
        view.missing[state] === 0 ? null : (
          <p className={styles.note} key={state}>
            {t(`eventTimeline.map.${key}`, { count: view.missing[state] })}
          </p>
        ),
      )}
    </section>
  )
}
