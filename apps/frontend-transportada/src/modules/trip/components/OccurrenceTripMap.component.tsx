/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { useOccurrenceTripMapData } from '../hooks/useOccurrenceTripMapData.hook'
import { OCCURRENCE_TRIP_MAP_EVENT_LOCATION_PERMISSION } from '../shared/occurrenceTripMap.constant'
import {
  buildOccurrenceTripMapView,
  type OccurrenceTripMapView,
} from '../shared/occurrenceTripMap.service'
import type { TripOccurrenceDetail } from '../shared/tripOccurrenceFeed.service'
import mapStyles from '../styles/occurrenceTripMap.module.css'
import styles from '../styles/trip.module.css'
import { OccurrenceTripMapCanvas } from './OccurrenceTripMapCanvas.component'
import { OccurrenceTripMapLegend } from './OccurrenceTripMapLegend.component'

const SKELETON_HEIGHT = 'var(--occurrence-trip-map-height)'

type OccurrenceTripMapProps = Readonly<{
  companyId?: string
  occurrence: TripOccurrenceDetail
  permissions: readonly string[]
}>

function LoadingState() {
  const { t } = useTranslation('trip')

  return (
    <SkeletonGroup label={t('occurrenceTripMap.loading')}>
      <Skeleton height={SKELETON_HEIGHT} variant="block" />
      <Skeleton variant="text" width="60%" />
    </SkeletonGroup>
  )
}

function ErrorState({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation('trip')

  return (
    <p className={mapStyles.note} role="alert">
      <Icon name="alert" /> {t('occurrenceTripMap.error')}{' '}
      <Button onClick={onRetry} size="sm" type="button" variant="ghost">
        <Icon name="refresh" />
        {t('occurrenceTripMap.retry')}
      </Button>
    </p>
  )
}

/** Sem `trip.event-location`: o aviso diz o que falta e a dica, quem concede. Nunca coordenada de evento. */
function RestrictedNotice() {
  const { t } = useTranslation('trip')

  return (
    <div className={mapStyles.notice} role="note">
      <Tooltip label={t('occurrenceTripMap.restricted.hint')}>
        <Icon name="eye-off" />
      </Tooltip>
      <p className={mapStyles.noticeTitle}>{t('occurrenceTripMap.restricted.title')}</p>
      <p className={mapStyles.noticeBody}>{t('occurrenceTripMap.restricted.body')}</p>
    </div>
  )
}

function resolveEmptyKey(view: OccurrenceTripMapView): null | string {
  if (view.mode === 'stopsOnly') return view.pins.length === 0 ? 'emptyStops' : null
  return view.locatedCount === 0 ? 'empty' : null
}

function OccurrenceStateNote({ view }: Readonly<{ view: OccurrenceTripMapView }>) {
  const { t } = useTranslation('trip')
  if (view.mode === 'stopsOnly' || view.occurrenceState === 'located') return null
  const detail = view.entries.find((entry) => entry.isThisOccurrence)?.detail ?? null
  const stateKey = view.occurrenceState === 'not-found' ? 'notFound' : 'withoutPosition'

  return (
    <p className={mapStyles.note}>
      {t(`occurrenceTripMap.occurrenceState.${stateKey}`)}
      {detail === null ? null : ` ${detail}`}
    </p>
  )
}

type MapBodyProps = Readonly<{ hasMoreEvents: boolean; view: OccurrenceTripMapView }>

function MapBody({ hasMoreEvents, view }: MapBodyProps) {
  const { t } = useTranslation('trip')
  const [hasBasemap, setHasBasemap] = useState(true)
  const [focusRequest, setFocusRequest] = useState<
    Readonly<{ nonce: number; stopKey: string }> | undefined
  >(undefined)
  const emptyKey = resolveEmptyKey(view)

  function handleFocus(pinKey: string) {
    setFocusRequest((previous) => ({ nonce: (previous?.nonce ?? 0) + 1, stopKey: pinKey }))
  }

  return (
    <div className={mapStyles.stack}>
      {view.mode === 'stopsOnly' ? <RestrictedNotice /> : null}
      {emptyKey === null ? null : (
        <p className={mapStyles.note}>{t(`occurrenceTripMap.${emptyKey}`)}</p>
      )}
      {view.pins.length === 0 ? null : hasBasemap ? (
        <OccurrenceTripMapCanvas
          focusRequest={focusRequest}
          onBasemapMissing={() => setHasBasemap(false)}
          points={view.pins}
        />
      ) : (
        <p className={mapStyles.note}>{t('occurrenceTripMap.mapMissing')}</p>
      )}
      {view.pins.length === 0 ? null : (
        <p className={mapStyles.note}>
          {t(
            view.mode === 'stopsOnly'
              ? 'occurrenceTripMap.captionStopsOnly'
              : 'occurrenceTripMap.caption',
          )}
        </p>
      )}
      <OccurrenceStateNote view={view} />
      <OccurrenceTripMapLegend onFocus={handleFocus} view={view} />
      {hasMoreEvents ? <p className={mapStyles.note}>{t('occurrenceTripMap.partial')}</p> : null}
    </div>
  )
}

/**
 * Spec 196 na ocorrência: o mapa da viagem. Os eventos com posição, numerados pela ordem do tempo, a
 * posição onde esta ocorrência foi registrada em destaque e a parada da nota. Lê a viagem e a linha
 * do tempo que já existem — nenhuma chamada nova, nenhuma de rota. Coordenada só vive em memória.
 */
export function OccurrenceTripMap({ companyId, occurrence, permissions }: OccurrenceTripMapProps) {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const data = useOccurrenceTripMapData({ companyId, permissions, tripId: occurrence.tripId })
  const canViewEventLocation = permissions.includes(OCCURRENCE_TRIP_MAP_EVENT_LOCATION_PERMISSION)
  const tripDocumentId = occurrence.document?.tripDocumentId ?? null
  const view = useMemo(
    () =>
      data.status === 'ready'
        ? buildOccurrenceTripMapView({
            canViewEventLocation,
            formatMoment,
            items: data.items,
            occurrence: { id: occurrence.id, stopLabel: occurrence.stopLabel, tripDocumentId },
            stops: data.stops,
            translate: t as Translate,
          })
        : null,
    [
      canViewEventLocation,
      data.items,
      data.status,
      data.stops,
      formatMoment,
      occurrence.id,
      occurrence.stopLabel,
      t,
      tripDocumentId,
    ],
  )

  return (
    <section aria-labelledby="occurrence-trip-map-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="occurrence-trip-map-title">{t('occurrenceTripMap.title')}</h2>
      </div>
      <p className={styles.hint}>{t('occurrenceTripMap.hint')}</p>
      {data.status === 'loading' ? <LoadingState /> : null}
      {data.status === 'error' ? <ErrorState onRetry={data.retry} /> : null}
      {view === null ? null : <MapBody hasMoreEvents={data.hasMoreEvents} view={view} />}
    </section>
  )
}
