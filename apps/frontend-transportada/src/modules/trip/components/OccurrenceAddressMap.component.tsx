/* Copyright (c) 2026 Ada Technology. MIT License. */
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import { stopColorOf } from '../shared/stopColor.service'
import styles from '../styles/trip.module.css'

/** O MapLibre entra por `lazy` como nos demais mapas: fora dele o precache do PWA estoura. */
const AssemblyVectorMap = lazy(async () => ({
  default: (await import('./AssemblyVectorMap.component')).AssemblyVectorMap,
}))

const NO_NEARBY: readonly AssemblyMapPoint[] = []
const ORIGINAL_COLOR = '#5b6770'
const NEW_COLOR = '#b8642e'

export type OccurrenceAddressMapPoint = Readonly<{ latitude: number; longitude: number }>

type OccurrenceAddressMapProps = Readonly<{
  /** O endereço de agora da parada (cadastro). `null`: ainda sem coordenada. */
  newPoint: null | OccurrenceAddressMapPoint
  originalPoint: null | OccurrenceAddressMapPoint
}>

function buildPoint(
  input: Readonly<{
    color: string
    key: 'new' | 'original'
    label: string
    point: OccurrenceAddressMapPoint
    sequence: number
  }>,
): AssemblyMapPoint {
  return {
    cityCode: '',
    color: input.color,
    isApproximate: false,
    isUnnumbered: true,
    label: input.label,
    latitude: input.point.latitude,
    longitude: input.point.longitude,
    notes: [],
    sequence: input.sequence,
    stopKey: input.key,
    x: input.point.longitude,
    y: input.point.latitude,
  }
}

/**
 * Spec 343: o mapa ao lado do formulário de endereço — o ponto do endereço original da parada e, conforme o escritório
 * digita, o do endereço novo. É o mesmo mapa da viagem (`AssemblyVectorMap`), sem traço e sem chamada de rota.
 */
export function OccurrenceAddressMap({ newPoint, originalPoint }: OccurrenceAddressMapProps) {
  const { t } = useTranslation('trip')
  const [isBasemapMissing, setIsBasemapMissing] = useState(false)
  const points: AssemblyMapPoint[] = [
    ...(originalPoint === null
      ? []
      : [
          buildPoint({
            color: ORIGINAL_COLOR,
            key: 'original',
            label: t('occurrenceDetail.driverAddress.map.original'),
            point: originalPoint,
            sequence: 1,
          }),
        ]),
    ...(newPoint === null
      ? []
      : [
          buildPoint({
            color: NEW_COLOR,
            key: 'new',
            label: t('occurrenceDetail.driverAddress.map.new'),
            point: newPoint,
            sequence: 2,
          }),
        ]),
  ]

  if (isBasemapMissing) {
    return <p className={styles.hint}>{t('occurrenceDetail.driverAddress.map.unavailable')}</p>
  }
  return (
    <div className={styles.driverAddressMap}>
      {points.length === 0 ? (
        <p className={styles.hint} role="status">
          {t('occurrenceDetail.driverAddress.map.empty')}
        </p>
      ) : (
        <Suspense
          fallback={
            <SkeletonGroup label={t('occurrenceDetail.driverAddress.map.loading')}>
              <Skeleton height="var(--occurrence-trip-map-height)" variant="block" />
            </SkeletonGroup>
          }
        >
          <AssemblyVectorMap
            geometry={null}
            hideRoute
            isQuietBasemap
            nearby={NO_NEARBY}
            onBasemapMissing={() => setIsBasemapMissing(true)}
            points={points}
            stopColor={stopColorOf}
          />
        </Suspense>
      )}
      <ul className={styles.driverAddressMapLegend}>
        <li data-kind="original">
          {originalPoint === null
            ? t('occurrenceDetail.driverAddress.map.noOriginal')
            : t('occurrenceDetail.driverAddress.map.original')}
        </li>
        <li data-kind="new">
          {newPoint === null
            ? t('occurrenceDetail.driverAddress.map.noNew')
            : t('occurrenceDetail.driverAddress.map.new')}
        </li>
      </ul>
    </div>
  )
}
