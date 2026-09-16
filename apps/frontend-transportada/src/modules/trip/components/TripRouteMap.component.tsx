/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import type { RouteGeometry } from '../shared/routeGeometry.service'
import { stopColorOf } from '../shared/stopColor.service'
import type { TripStopDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'
import { RouteTollSummary } from './RouteTollSummary.component'

/** O MapLibre entra por `lazy` pelo mesmo motivo da montagem: fora dele o precache do PWA estoura. */
const AssemblyVectorMap = lazy(async () => ({
  default: (await import('./AssemblyVectorMap.component')).AssemblyVectorMap,
}))

/** A altura é a mesma de `.vectorMap` — o esqueleto tem a forma do que ele antecede. */
const MAP_HEIGHT = '18rem'
const METERS_PER_KILOMETER = 1000
/** Referência estável: o efeito dos marcadores depende de `nearby`, e `[]` inline o dispararia sempre. */
const NO_NEARBY: readonly AssemblyMapPoint[] = []

type TripRouteMapProps = Readonly<{
  geometry: RouteGeometry | null
  /** Corrigir é escrita: sem `trip.manage` a tela mostra o mapa e não oferece o pino. */
  canCorrect: boolean
  isCorrecting: boolean
  /** GET /trips/:id pode levar segundos — os pinos desenham enquanto a estrada não chega. */
  isGeometryError: boolean
  isGeometryPending: boolean
  onCorrect: (input: Readonly<{ addressKey: string; latitude: string; longitude: string }>) => void
  onRetryGeometry: () => void
  stops: readonly TripStopDetail[]
}>

type LocatedStops = Readonly<{
  points: readonly AssemblyMapPoint[]
  stopsWithoutLocation: readonly string[]
}>

/**
 * A parada da viagem vira ponto do mapa da montagem. ⚠️ Parada sem coordenada **é nomeada abaixo do
 * mapa, nunca some** — descartar a lista aqui é onde a regra se perde entre o dado e o JSX.
 */
function locateStops(stops: readonly TripStopDetail[]): LocatedStops {
  const points: AssemblyMapPoint[] = []
  const stopsWithoutLocation: string[] = []
  for (const stop of [...stops].sort((left, right) => left.sequence - right.sequence)) {
    const latitude = Number(stop.latitude ?? Number.NaN)
    const longitude = Number(stop.longitude ?? Number.NaN)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      stopsWithoutLocation.push(stop.label)
      continue
    }
    points.push({
      cityCode: stop.cityCode ?? '',
      isApproximate: false,
      label: stop.label,
      latitude,
      longitude,
      notes: [],
      sequence: stop.sequence,
      stopKey: stop.addressKey,
      x: longitude,
      y: latitude,
    })
  }
  return { points, stopsWithoutLocation }
}

/**
 * Spec 079 T013: o roteiro desenhado — **o mesmo mapa da criação da viagem** (MapLibre sobre o
 * basemap próprio), com a estrada que a viagem gravou, as praças de pedágio e o custo da rota. O
 * detalhe tinha um desenho à parte, em contorno de município, e quem criava a viagem num mapa de
 * ruas a reabria num mapa que não reconhecia.
 */
export function TripRouteMap({
  canCorrect,
  geometry,
  isCorrecting,
  isGeometryError,
  isGeometryPending,
  onCorrect,
  onRetryGeometry,
  stops,
}: TripRouteMapProps) {
  const { t } = useTranslation('trip')
  const [hasBasemap, setHasBasemap] = useState(true)
  /**
   * ⚠️ Memorizado, e não é otimização: os efeitos do mapa dependem de `points`, e um arranjo novo a
   * cada render recriava os pinos e voltava ao enquadramento — marcar uma nota na lista desfazia o
   * zoom de quem conferia o roteiro.
   */
  const { points, stopsWithoutLocation } = useMemo(() => locateStops(stops), [stops])

  if (points.length === 0 && stopsWithoutLocation.length === 0) return null

  const route = geometry?.options?.[0] ?? null
  const traceKind = geometry !== null && geometry.legs.length > 0 ? 'road' : 'straight'

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('routeMap.title')}</h3>
      {points.length === 0 ? null : hasBasemap ? (
        <Suspense
          fallback={
            <SkeletonGroup label={t('routeMap.loadingGeometry')}>
              <Skeleton height={MAP_HEIGHT} variant="block" />
            </SkeletonGroup>
          }
        >
          <AssemblyVectorMap
            geometry={geometry}
            nearby={NO_NEARBY}
            onBasemapMissing={() => setHasBasemap(false)}
            points={points}
            stopColor={stopColorOf}
          />
        </Suspense>
      ) : (
        <p className={styles.hint}>{t('assemblyMap.withoutBasemap')}</p>
      )}
      {isGeometryPending ? (
        <p className={styles.hint} role="status">
          {t('routeMap.loadingGeometry')}
        </p>
      ) : null}
      {isGeometryError ? (
        <p className={styles.hint} role="status">
          {t('routeMap.geometryUnavailable')}
          <Button onClick={onRetryGeometry} size="sm" type="button" variant="ghost">
            <Icon name="refresh" />
            {t('routeMap.retry')}
          </Button>
        </p>
      ) : null}
      {/*
        ⚠️ Custo sem valor **diz que não foi calculado**, nunca zero: zero ali seria a afirmação de que
        a rota não gasta combustível ou não passa por praça nenhuma.
      */}
      {route === null ? null : (
        <dl className={styles.routeCost}>
          <div>
            <dt>{t('routeMap.cost.distance')}</dt>
            <dd>
              {t('routeMap.cost.kilometers', {
                distance: (route.distanceMeters / METERS_PER_KILOMETER).toFixed(1),
              })}
            </dd>
          </div>
          <div>
            <dt>{t('routeMap.cost.fuel')}</dt>
            <dd className={styles.routeCostExpense}>
              {route.fuelTotal === null
                ? t('routeMap.cost.notCalculated')
                : formatAmount(route.fuelTotal)}
            </dd>
          </div>
          <div>
            <dt>{t('routeMap.cost.toll')}</dt>
            <dd className={styles.routeCostExpense}>
              {route.toll === null
                ? t('routeMap.cost.notCalculated')
                : formatAmount(route.toll.total)}
            </dd>
          </div>
          <div>
            <dt>{t('routeMap.cost.total')}</dt>
            <dd className={styles.routeCostExpense}>
              {route.totalCost === null
                ? t('routeMap.cost.notCalculated')
                : formatAmount(route.totalCost)}
            </dd>
          </div>
        </dl>
      )}
      {route === null ||
      route.totalCost !== null ||
      geometry?.costGap === undefined ||
      geometry.costGap === null ? null : (
        <p className={styles.hint}>{t(`assemblyMap.routeOptions.gap.${geometry.costGap}`)}</p>
      )}
      <RouteTollSummary toll={geometry?.toll ?? null} />
      {canCorrect ? (
        <TripStopPointCorrection isCorrecting={isCorrecting} onCorrect={onCorrect} stops={stops} />
      ) : null}
      <p className={styles.hint}>{t(`routeMap.trace.${traceKind}`)}</p>
      {stopsWithoutLocation.length === 0 ? null : (
        <p className={styles.hint}>
          {t('routeMap.withoutLocation', { stops: stopsWithoutLocation.join(', ') })}
        </p>
      )}
    </section>
  )
}

/**
 * O degrau 3 da escada da ADR-0044: o pino manual, quando a cascata e o refino não acertaram.
 *
 * ⚠️ **A correção é do endereço, não da viagem.** Ela vale para toda viagem que passe por aquele
 * portão, presente e futura — e o texto diz isso, senão quem corrige acha que ajustou só o roteiro
 * que está olhando. `correção humana sempre vence a cascata` (ADR-0044 §3, degrau 1) é regra do
 * servidor; aqui a tela só a aciona.
 */
function TripStopPointCorrection({
  isCorrecting,
  onCorrect,
  stops,
}: Readonly<{
  isCorrecting: boolean
  onCorrect: (input: Readonly<{ addressKey: string; latitude: string; longitude: string }>) => void
  stops: readonly TripStopDetail[]
}>) {
  const { t } = useTranslation('trip')
  const [addressKey, setAddressKey] = useState(stops[0]?.addressKey ?? '')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  if (stops.length === 0) return null

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="ghost">
        <Icon name="edit" />
        {t('routeMap.correct')}
      </Button>
    )
  }

  return (
    <div className={styles.occurrenceForm}>
      <p className={styles.hint}>{t('routeMap.correctionScope')}</p>
      <Select
        ariaLabel={t('routeMap.correct')}
        onChange={setAddressKey}
        options={stops.map((stop) => ({ label: stop.label, value: stop.addressKey }))}
        value={addressKey}
      />
      <input
        aria-label={t('routeMap.latitude')}
        onChange={(event) => setLatitude(event.target.value)}
        placeholder={t('routeMap.latitude')}
        type="text"
        value={latitude}
      />
      <input
        aria-label={t('routeMap.longitude')}
        onChange={(event) => setLongitude(event.target.value)}
        placeholder={t('routeMap.longitude')}
        type="text"
        value={longitude}
      />
      <Button
        disabled={isCorrecting}
        onClick={() => {
          onCorrect({ addressKey, latitude, longitude })
          setIsOpen(false)
        }}
        size="sm"
        type="button"
      >
        <Icon name="save" />
        {t('routeMap.save')}
      </Button>
      <Button onClick={() => setIsOpen(false)} size="sm" type="button" variant="ghost">
        <Icon name="close" />
        {t('routeMap.cancel')}
      </Button>
    </div>
  )
}
