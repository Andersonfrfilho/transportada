/* Copyright (c) 2026 Ada Technology. MIT License. */
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import { stopColorOf } from '../shared/stopColor.service'
import styles from '../styles/occurrenceTripMap.module.css'

/** O MapLibre entra por `lazy` como nos demais mapas: fora dele o precache do PWA estoura. */
const AssemblyVectorMap = lazy(async () => ({
  default: (await import('./AssemblyVectorMap.component')).AssemblyVectorMap,
}))

/** Referência estável: o efeito dos marcadores depende de `nearby`, e `[]` inline o dispararia sempre. */
const NO_NEARBY: readonly AssemblyMapPoint[] = []
const MAP_HEIGHT = 'var(--occurrence-trip-map-height)'

type OccurrenceTripMapCanvasProps = Readonly<{
  focusRequest: Readonly<{ nonce: number; stopKey: string }> | undefined
  onBasemapMissing: () => void
  points: readonly AssemblyMapPoint[]
}>

/**
 * O mesmo mapa do roteiro (MapLibre sobre o basemap PMTiles de `vectorBasemap.service`), sem traço:
 * a rota congelada não vem no detalhe da viagem e esta tela não faz chamada de rota.
 */
export function OccurrenceTripMapCanvas({
  focusRequest,
  onBasemapMissing,
  points,
}: OccurrenceTripMapCanvasProps) {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.canvas}>
      <Suspense
        fallback={
          <SkeletonGroup label={t('occurrenceTripMap.loading')}>
            <Skeleton height={MAP_HEIGHT} variant="block" />
          </SkeletonGroup>
        }
      >
        <AssemblyVectorMap
          focusRequest={focusRequest}
          geometry={null}
          hideRoute
          isEntryAnimated
          isQuietBasemap
          nearby={NO_NEARBY}
          onBasemapMissing={onBasemapMissing}
          points={points}
          stopColor={stopColorOf}
        />
      </Suspense>
    </div>
  )
}
