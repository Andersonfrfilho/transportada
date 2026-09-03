/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip, DriverTripStop } from './driverTrip.types'
import { findCurrentStop, isDocumentSettled, isStopPending } from './driverTripView.service'

/**
 * Spec 082 D1: a barra de progresso do topo é por parada, não por nota — o motorista pensa em
 * portões, e é um segmento por portão que ele consegue ler com o celular na mão.
 */
export type DriverStopProgressState = 'current' | 'pending' | 'resolved'

export type DriverStopProgressSegment = Readonly<{
  state: DriverStopProgressState
  stopId: string
}>

export type DriverTripProgress = Readonly<{
  resolvedCount: number
  segments: readonly DriverStopProgressSegment[]
  totalCount: number
}>

/**
 * Resolvida é a parada em que **toda** nota saiu do eixo do campo — `delivered` ou `returned`.
 * Parada sem nota (não deveria existir: parada é derivada do vínculo) conta como resolvida, porque
 * não há nada ali para o motorista fazer.
 */
export function isStopResolved(stop: DriverTripStop): boolean {
  return stop.documents.every(isDocumentSettled)
}

/**
 * A corrente é **a mesma** da lista de paradas: `findCurrentStop` — a primeira com `completedAt`
 * nulo. Uma segunda definição aqui fazia a barra destacar um portão e a lista outro.
 */
export function computeTripProgress(trip: DriverTrip): DriverTripProgress {
  const currentStopId = findCurrentStop(trip)?.id

  const segments = trip.stops.map((stop): DriverStopProgressSegment => {
    if (stop.id === currentStopId) {
      return { state: 'current', stopId: stop.id }
    }
    if (isStopResolved(stop) || !isStopPending(stop)) {
      return { state: 'resolved', stopId: stop.id }
    }
    return { state: 'pending', stopId: stop.id }
  })

  return {
    resolvedCount: segments.filter((segment) => segment.state === 'resolved').length,
    segments,
    totalCount: segments.length,
  }
}
