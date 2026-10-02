/* Copyright (c) 2026 Ada Technology. MIT License. */
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import type { TripTimelineLocationView } from '../shared/tripTimelineDetail.service'
import { EVENT_PIN_COLOR, stopColorOf } from '../shared/stopColor.service'
import {
  TRIP_TIMELINE_LOCATION_EVENT_PIN_KEY,
  TRIP_TIMELINE_LOCATION_EVENT_PIN_SEQUENCE,
} from '../shared/trip.constant'
import styles from '../styles/tripTimeline.module.css'

/** O mesmo mapa do `TripRouteMap`, e pelo mesmo motivo `lazy`: fora dele o precache do PWA estoura. */
const AssemblyVectorMap = lazy(async () => ({
  default: (await import('./AssemblyVectorMap.component')).AssemblyVectorMap,
}))

const MAP_HEIGHT = '18rem'
const NO_NEARBY: readonly AssemblyMapPoint[] = []

export type TripTimelineLocationMapStop = Readonly<{
  label: string
  latitude: number
  longitude: number
  sequence: number
  stopKey: string
}>

type TripTimelineLocationMapProps = Readonly<{
  eventLatitude: number
  eventLongitude: number
  /** `address`: o pino liso é o ponto novo do endereço, não o toque do motorista. */
  pin: TripTimelineLocationView['pin']
  /** `null` quando a parada não tem coordenada geocodificada: o mapa mostra só o ponto do evento. */
  stop: null | TripTimelineLocationMapStop
}>

function resolvePinColor(sequence: number): string {
  return sequence === TRIP_TIMELINE_LOCATION_EVENT_PIN_SEQUENCE
    ? EVENT_PIN_COLOR
    : stopColorOf(sequence)
}

function buildPoint(
  input: Readonly<{
    isUnnumbered?: boolean
    label: string
    latitude: number
    longitude: number
    sequence: number
    stopKey: string
  }>,
): AssemblyMapPoint {
  return {
    ...input,
    cityCode: '',
    isApproximate: false,
    notes: [],
    x: input.longitude,
    y: input.latitude,
  }
}

/**
 * Os dois pinos do evento expandido: onde o motorista tocou (pino liso) e a parada (pino numerado).
 * A coordenada só vai ao mapa em memória — nenhuma URL, nenhum tile de terceiro (ADR-0044 §6).
 */
export function TripTimelineLocationMap({
  eventLatitude,
  eventLongitude,
  pin,
  stop,
}: TripTimelineLocationMapProps) {
  const { t } = useTranslation('trip')
  const [hasBasemap, setHasBasemap] = useState(true)
  const legendKeyPrefix = pin === 'address' ? 'legendAddress' : 'legend'
  const points = useMemo(
    () => [
      buildPoint({
        isUnnumbered: true,
        label: t(`eventTimeline.location.${pin === 'address' ? 'addressPin' : 'eventPin'}`),
        latitude: eventLatitude,
        longitude: eventLongitude,
        sequence: TRIP_TIMELINE_LOCATION_EVENT_PIN_SEQUENCE,
        stopKey: TRIP_TIMELINE_LOCATION_EVENT_PIN_KEY,
      }),
      ...(stop === null ? [] : [buildPoint(stop)]),
    ],
    [eventLatitude, eventLongitude, pin, stop, t],
  )

  if (!hasBasemap)
    return <p className={styles.itemDetail}>{t('eventTimeline.location.mapMissing')}</p>

  return (
    <figure className={styles.locationMap}>
      <Suspense
        fallback={
          <SkeletonGroup label={t('eventTimeline.location.mapLoading')}>
            <Skeleton height={MAP_HEIGHT} variant="block" />
          </SkeletonGroup>
        }
      >
        <AssemblyVectorMap
          geometry={null}
          hideRoute
          isQuietBasemap
          nearby={NO_NEARBY}
          onBasemapMissing={() => setHasBasemap(false)}
          points={points}
          stopColor={resolvePinColor}
        />
      </Suspense>
      <figcaption className={styles.itemDetail}>
        {stop === null
          ? t(`eventTimeline.location.${legendKeyPrefix}EventOnly`)
          : t(`eventTimeline.location.${legendKeyPrefix}`, { sequence: stop.sequence })}
      </figcaption>
    </figure>
  )
}
