/* Copyright (c) 2026 Ada Technology. MIT License. */
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { AssemblyMapPoint } from '@/modules/trip/shared/assemblyMap.service'
import { stopColorOf } from '@/modules/trip/shared/stopColor.service'

import type { AddressSuggestionDetails } from '../shared/pendingItemsClient.service'
import styles from '../styles/pendingItems.module.css'

/** O MapLibre entra por `lazy` como nos demais mapas: fora dele o precache do PWA estoura. */
const AssemblyVectorMap = lazy(async () => ({
  default: (await import('@/modules/trip/components/AssemblyVectorMap.component'))
    .AssemblyVectorMap,
}))

const NO_NEARBY: readonly AssemblyMapPoint[] = []
const CURRENT_COLOR = '#5b6770'
const SUGGESTED_COLOR = '#b8642e'

type AddressSuggestionMapProps = Readonly<{
  details: AddressSuggestionDetails
  label: string
}>

function buildPoint(
  input: Readonly<{
    color: string
    kind: 'current' | 'suggested'
    label: string
    latitude: number
    longitude: number
    sequence: number
  }>,
): AssemblyMapPoint {
  return {
    cityCode: '',
    color: input.color,
    isApproximate: false,
    isUnnumbered: true,
    label: input.label,
    latitude: input.latitude,
    longitude: input.longitude,
    notes: [],
    sequence: input.sequence,
    stopKey: input.kind,
    x: 0,
    y: 0,
  }
}

export function AddressSuggestionMap({ details, label }: AddressSuggestionMapProps) {
  const { t } = useTranslation('pendingItems')
  const [isBasemapMissing, setIsBasemapMissing] = useState(false)
  const points: AssemblyMapPoint[] = [
    ...(details.current === null
      ? []
      : [
          buildPoint({
            color: CURRENT_COLOR,
            kind: 'current',
            label: `${t('map.current')} — ${label}`,
            ...details.current,
            sequence: 1,
          }),
        ]),
    buildPoint({
      color: SUGGESTED_COLOR,
      kind: 'suggested',
      label: `${t('map.suggested')} — ${label}`,
      ...details.suggested,
      sequence: 2,
    }),
  ]

  if (isBasemapMissing) return <p className={styles.mapNote}>{t('map.unavailable')}</p>

  return (
    <div className={styles.map}>
      <Suspense
        fallback={
          <SkeletonGroup label={t('map.loading')}>
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
      <ul className={styles.legend}>
        {details.current === null ? <li>{t('map.noCurrent')}</li> : <li>{t('map.current')}</li>}
        <li>{t('map.suggested')}</li>
      </ul>
    </div>
  )
}
