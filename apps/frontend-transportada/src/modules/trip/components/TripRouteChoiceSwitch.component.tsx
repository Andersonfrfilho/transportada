/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { resolveRouteChoiceFromIndex } from '../shared/assemblyRouteOptions.service'
import type { RouteChoice, RouteChoiceCriterion } from '../shared/routeGeometry.service'
import type { TripStopDetail } from '../shared/trip.types'
import { RouteChoiceOptions } from './RouteChoiceOptions.component'

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
  stops: readonly TripStopDetail[]
  vehicleId: string
}>

const FIVE_MINUTES_MS = 5 * 60 * 1000

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
  stops,
  vehicleId,
}: TripRouteChoiceSwitchProps) {
  const points = stops
    .map((stop) => ({
      latitude: Number(stop.latitude ?? Number.NaN),
      longitude: Number(stop.longitude ?? Number.NaN),
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
  const routeKey = points.map((point) => `${point.latitude},${point.longitude}`).join(';')
  const tollVehicleId = vehicleId === '' ? null : vehicleId

  const geometryQuery = useQuery({
    enabled: canSwitch && points.length >= 2,
    queryFn: () => getTripClient().readPointsRouteGeometry({ points, vehicleId: tollVehicleId }),
    /** A chave nunca inclui o critério escolhido — senão a troca refaria a busca (RF13). */
    queryKey: ['trip-detail-route-choice', routeKey, tollVehicleId] as const,
    staleTime: FIVE_MINUTES_MS,
  })

  if (!canSwitch || points.length < 2) return null

  const options = geometryQuery.data?.options ?? []
  const cheapestIndex = geometryQuery.data?.cheapestIndex ?? null
  const fastestIndex = geometryQuery.data?.fastestIndex ?? null
  const costGap = geometryQuery.data?.costGap ?? null
  /** A aba marcada segue o que está gravado **hoje** — nunca o índice de uma resposta anterior. */
  const selectedIndex =
    (criterion === 'fastest' ? fastestIndex : cheapestIndex) ?? fastestIndex ?? cheapestIndex ?? 0

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
