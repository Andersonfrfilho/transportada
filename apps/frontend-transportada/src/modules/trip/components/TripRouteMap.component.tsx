/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { formatDuration } from '../shared/assemblyLeg.service'
import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import {
  resolveAssemblyRouteChoice,
  resolveRouteOptionSummaries,
} from '../shared/assemblyRouteOptions.service'
import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type {
  RouteChoice,
  RouteChoiceCriterion,
  RouteGeometry,
} from '../shared/routeGeometry.service'
import { stopColorOf } from '../shared/stopColor.service'
import type { TripStopDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'
import { RouteTollSummary } from './RouteTollSummary.component'

/**
 * Spec 178 RF2/RF5: os estados que ainda aceitam replanejar — a mesma lista de
 * `checkPlanRoute` (`trip-state.policy.ts`), copiada por valor porque o bundle não carrega
 * código da API. Fora daqui, o critério aparece e a troca não (RF5).
 */
const REPLANNABLE_TRIP_STATUSES = ['draft', 'loading', 'route_planned', 'separating'] as const

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
  /** RF7 (spec 154): sem `settings.manage` o extrato não oferece o botão de ajustar a praça. */
  canAdjustTollBooth: boolean
  /** Corrigir é escrita: sem `trip.manage` a tela mostra o mapa e não oferece o pino. */
  canCorrect: boolean
  isCorrecting: boolean
  /** GET /trips/:id pode levar segundos — os pinos desenham enquanto a estrada não chega. */
  isGeometryError: boolean
  isGeometryPending: boolean
  onCorrect: (input: Readonly<{ addressKey: string; latitude: string; longitude: string }>) => void
  onRetryGeometry: () => void
  stops: readonly TripStopDetail[]
  /** Spec 178 RF2: sem `trip.manage`, ou fora dos estados replanejáveis, a troca não aparece. */
  canManage: boolean
  isPlanRoutePending: boolean
  onPlanRoute: (routeChoice: RouteChoice | undefined) => void
  tripStatus: string
  vehicleId: null | string
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
      hasOpenOccurrence: stop.hasOpenOccurrence === true,
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
  canAdjustTollBooth,
  canCorrect,
  canManage,
  geometry,
  isCorrecting,
  isGeometryError,
  isGeometryPending,
  isPlanRoutePending,
  onCorrect,
  onPlanRoute,
  onRetryGeometry,
  stops,
  tripStatus,
  vehicleId,
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

  /** A rota que a viagem usa (spec 153) — a congelada no planejamento, não sempre a principal. */
  const route = geometry?.options?.[geometry.selectedIndex ?? 0] ?? null
  const traceKind = geometry !== null && geometry.legs.length > 0 ? 'road' : 'straight'
  /**
   * Spec 178 RF4: a rota congelada não guarda se veio de `exclude=toll` — mas guarda o critério, e
   * `no_toll` **é** a escolha de evitar praça. Deriva a etiqueta dele, em vez do `false` fixo de
   * antes desta task.
   */
  const isNoTollRoute = geometry?.criterion === 'no_toll'
  /** Spec 178 RF2/RF5: mesma lista de `checkPlanRoute` — fora dela o critério aparece e a troca não. */
  const canTradeRoute =
    canManage && (REPLANNABLE_TRIP_STATUSES as readonly string[]).includes(tripStatus)

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
      {/* Spec 178 RF1: o critério que produziu a rota, ao lado da distância — não só o número. */}
      {geometry?.criterion === null || geometry?.criterion === undefined ? null : (
        <p className={styles.hint}>
          <Icon name="target" size="sm" />
          {t(`routeMap.criterion.${toCriterionKey(geometry.criterion)}`)}
        </p>
      )}
      <RouteTollSummary
        canAdjustTollBooth={canAdjustTollBooth}
        isNoTollRoute={isNoTollRoute}
        toll={geometry?.toll ?? null}
      />
      {canTradeRoute ? (
        <TripRouteTrade
          isPlanRoutePending={isPlanRoutePending}
          onPlanRoute={onPlanRoute}
          points={points}
          vehicleId={vehicleId}
        />
      ) : null}
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

/** `no_toll` vira `noToll` — a chave de locale é camelCase, o critério é snake_case. */
function toCriterionKey(criterion: RouteChoiceCriterion): string {
  return criterion === 'no_toll' ? 'noToll' : criterion
}

/**
 * Spec 178 RF2/RF3: a troca de critério enquanto a viagem ainda aceita replanejar.
 *
 * ⚠️ **Uma consulta só, aberta pelo operador** — `readPointsRouteGeometry` roda quando o painel
 * abre, nunca no carregamento do detalhe: é a mesma leitura que traz todas as alternativas de uma
 * vez (RF "nenhuma consulta nova por alternativa"), e a montagem já prova que ela não precisa se
 * repetir por opção.
 *
 * ⚠️ **Reaproveita `assemblyRouteOptions.service.ts`** (RF3): o mesmo rotulador da montagem, para
 * não afirmar duas contas de "mais barata" que podem discordar.
 */
function TripRouteTrade({
  isPlanRoutePending,
  onPlanRoute,
  points,
  vehicleId,
}: Readonly<{
  isPlanRoutePending: boolean
  onPlanRoute: (routeChoice: RouteChoice | undefined) => void
  points: readonly AssemblyMapPoint[]
  vehicleId: null | string
}>) {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const routeKey = points.map((point) => `${point.latitude},${point.longitude}`).join(';')

  const geometryQuery = useQuery({
    enabled: isOpen && points.length >= 2,
    queryFn: () =>
      getTripClient().readPointsRouteGeometry({
        points: points.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
        vehicleId,
      }),
    queryKey: ['trip-route-trade', routeKey, vehicleId] as const,
    staleTime: 5 * 60 * 1000,
  })

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="ghost">
        <Icon name="refresh" />
        {t('routeMap.trade.open')}
      </Button>
    )
  }

  const options = geometryQuery.data?.options ?? []
  const hasChoice = geometryQuery.data?.hasChoice ?? false
  const cheapestIndex = geometryQuery.data?.cheapestIndex ?? null
  const fastestIndex = geometryQuery.data?.fastestIndex ?? null
  const boundedIndex = Math.min(selectedIndex, Math.max(options.length - 1, 0))
  const summaries = resolveRouteOptionSummaries({ cheapestIndex, fastestIndex, options })

  function handleConfirm(): void {
    const routeChoice = resolveAssemblyRouteChoice({
      cheapestIndex,
      fastestIndex,
      hasChoice,
      options,
      selectedIndex: boundedIndex,
    })
    onPlanRoute(routeChoice)
    setIsOpen(false)
  }

  return (
    <div className={styles.occurrenceForm}>
      <p className={styles.hint}>{t('routeMap.trade.title')}</p>
      {geometryQuery.isPending ? (
        <p className={styles.hint} role="status">
          {t('routeMap.trade.loading')}
        </p>
      ) : null}
      {geometryQuery.isError ? (
        <p className={styles.hint} role="status">
          {t('routeMap.trade.unavailable')}
        </p>
      ) : null}
      {/* Rota única não é escolha (spec 096 D2): melhor dizer que não há outra que oferecer um seletor de um item só. */}
      {geometryQuery.isSuccess && options.length <= 1 ? (
        <p className={styles.hint}>{t('routeMap.trade.singleOption')}</p>
      ) : null}
      {options.length <= 1 ? null : (
        <ul className={styles.routeOptionList}>
          {summaries.map((summary, index) => (
            <li key={index}>
              <Button
                aria-pressed={index === boundedIndex}
                className={styles.routeOption}
                onClick={() => setSelectedIndex(index)}
                type="button"
                variant="secondary"
              >
                <span className={styles.routeOptionHeader}>
                  {index === boundedIndex ? <Icon name="check" /> : <Icon name="target" />}
                  {summary.isBestOfBoth ? (
                    <span className={styles.routeOptionBadge}>
                      <Icon name="speed" size="sm" />
                      <Icon name="cost-down" size="sm" />
                      {t('assemblyMap.routeOptions.fastestAndCheapest')}
                    </span>
                  ) : (
                    <>
                      {summary.isFastest ? (
                        <span className={styles.routeOptionBadge}>
                          <Icon name="speed" size="sm" />
                          {t('assemblyMap.routeOptions.fastest')}
                        </span>
                      ) : null}
                      {summary.isCheapest ? (
                        <span className={styles.routeOptionBadge}>
                          <Icon name="cost-down" size="sm" />
                          {t('assemblyMap.routeOptions.cheapest')}
                        </span>
                      ) : null}
                    </>
                  )}
                  {summary.isNoToll ? (
                    <span className={styles.routeOptionBadge}>
                      <Icon name="invoice" size="sm" />
                      {t('assemblyMap.routeOptions.noToll')}
                    </span>
                  ) : null}
                </span>
                {summary.totalCost === null ? null : (
                  <span className={styles.routeOptionTotal}>
                    {t('assemblyMap.routeOptions.total', {
                      amount: formatAmount(summary.totalCost),
                    })}
                  </span>
                )}
                <span className={styles.routeOptionFacts}>
                  {t(
                    summary.boothCount === null
                      ? 'assemblyMap.routeOptions.optionWithoutToll'
                      : 'assemblyMap.routeOptions.option',
                    {
                      count: summary.boothCount ?? 0,
                      distance: summary.distanceKilometres.toFixed(1),
                      duration: formatDuration(summary.minutes),
                    },
                  )}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        disabled={isPlanRoutePending || options.length === 0}
        onClick={handleConfirm}
        size="sm"
        type="button"
      >
        <Icon name="check" />
        {isPlanRoutePending ? t('routeMap.trade.pending') : t('routeMap.trade.confirm')}
      </Button>
      <Button onClick={() => setIsOpen(false)} size="sm" type="button" variant="ghost">
        <Icon name="close" />
        {t('routeMap.trade.cancel')}
      </Button>
    </div>
  )
}
