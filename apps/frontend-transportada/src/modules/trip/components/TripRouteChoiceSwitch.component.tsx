/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import {
  resolveRouteChoiceFromIndex,
  resolveSelectedOptionIndex,
} from '../shared/assemblyRouteOptions.service'
import type {
  RouteChoice,
  RouteChoiceCriterion,
  RouteGeometry,
} from '../shared/routeGeometry.service'
import type { TripClient } from '../shared/tripClient.service'
import type { TripStopDetail } from '../shared/trip.types'
import { RouteChoiceOptions } from './RouteChoiceOptions.component'

const FIVE_MINUTES_MS = 5 * 60 * 1000

export type CreateTripRouteChoiceQueryOptionsParams = Readonly<{
  client: TripClient
  enabled: boolean
  points: readonly Readonly<{ latitude: number; longitude: number }>[]
  vehicleId: null | string
}>

/**
 * Spec 153 T706/RF13: opções puras da query de geometria viva — extraídas para que o teste de
 * comportamento monte um `QueryObserver` real sobre a mesma `queryKey` que o componente usa, em vez
 * de contar ocorrências de string no fonte. A chave nunca inclui o critério escolhido nem começa
 * por `'trips'` — senão o `invalidate()` pós `plan-route` (que atinge `['trips', ...]`) refaria a
 * busca ao roteirizador, o próprio defeito que o RF13 pede para nunca acontecer.
 */
export function createTripRouteChoiceQueryOptions(
  params: CreateTripRouteChoiceQueryOptionsParams,
): Readonly<{
  enabled: boolean
  queryFn: () => Promise<RouteGeometry>
  queryKey: readonly [string, string, null | string]
  staleTime: number
}> {
  const routeKey = params.points.map((point) => `${point.latitude},${point.longitude}`).join(';')

  return {
    enabled: params.enabled,
    queryFn: () =>
      params.client.readPointsRouteGeometry({ points: params.points, vehicleId: params.vehicleId }),
    queryKey: ['trip-detail-route-choice', routeKey, params.vehicleId] as const,
    staleTime: FIVE_MINUTES_MS,
  }
}

type TripRouteChoiceSwitchProps = Readonly<{
  /** Sem `trip.financials` o total por opção some — nunca zero (spec 153 D10). */
  canReadFinancials: boolean
  /** `trip.manage` e viagem editável (antes do despacho, spec 153 D6) — nunca despachada. */
  canSwitch: boolean
  /** O critério **gravado hoje** — decide qual aba (mais rápida/mais barata) chega marcada. */
  criterion: null | RouteChoiceCriterion
  /** A viagem já tem uma regravação em voo — nova troca espera a anterior responder. */
  isPending: boolean
  /** Quem regrava é quem tem `tripId` (spec 153 T402, comentário de `onRouteChoiceChange`). */
  onSelect: (routeChoice: RouteChoice) => void
  /** A assinatura **gravada hoje** (spec 153 D2/T709a) — decide a aba antes do critério, para
   *  `no_toll`/`alternative` marcarem a rota certa, não "a mais barata". */
  selectedSignature: null | string
  stops: readonly TripStopDetail[]
  vehicleId: string
}>

/**
 * Spec 153 T405/RF13: o switch mais rápida ↔ mais barata da **última** tela onde o operador troca
 * a rota de uma viagem já congelada. Reaproveita `RouteChoiceOptions` (T402) sobre uma única
 * leitura viva do roteirizador — o mesmo fan-out que `TripAssemblyMap` usa — e trocar nunca refaz
 * essa ida; só o `onSelect` sai daqui, e é o chamador (`TripDetail`) que regrava via `plan-route`
 * (RF3), com `frozen_at` novo.
 */
export function TripRouteChoiceSwitch({
  canReadFinancials,
  canSwitch,
  criterion,
  isPending,
  onSelect,
  selectedSignature,
  stops,
  vehicleId,
}: TripRouteChoiceSwitchProps) {
  const points = stops
    .map((stop) => ({
      latitude: Number(stop.latitude ?? Number.NaN),
      longitude: Number(stop.longitude ?? Number.NaN),
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
  const tollVehicleId = vehicleId === '' ? null : vehicleId

  const geometryQuery = useQuery(
    createTripRouteChoiceQueryOptions({
      client: getTripClient(),
      enabled: canSwitch && points.length >= 2,
      points,
      vehicleId: tollVehicleId,
    }),
  )

  if (!canSwitch || points.length < 2) return null

  const options = geometryQuery.data?.options ?? []
  const cheapestIndex = geometryQuery.data?.cheapestIndex ?? null
  const fastestIndex = geometryQuery.data?.fastestIndex ?? null
  const costGap = geometryQuery.data?.costGap ?? null
  /** A aba marcada segue o que está gravado **hoje** — nunca o índice de uma resposta anterior. */
  const selectedIndex = resolveSelectedOptionIndex({
    cheapestIndex,
    criterion,
    fastestIndex,
    options,
    selectedSignature,
  })

  function handleSelect(index: number): void {
    if (isPending) return
    onSelect(resolveRouteChoiceFromIndex({ cheapestIndex, fastestIndex, index, options }))
  }

  return (
    <RouteChoiceOptions
      canReadFinancials={canReadFinancials}
      cheapestIndex={cheapestIndex}
      costGap={costGap}
      fastestIndex={fastestIndex}
      onSelect={handleSelect}
      options={options}
      selectedIndex={selectedIndex}
    />
  )
}
