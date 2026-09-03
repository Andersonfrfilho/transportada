/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip, DriverTripStop } from './driverTrip.types'
import { isDocumentSettled } from './driverTripView.service'

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

/** A corrente é a primeira não resolvida — a mesma leitura de "onde estou" da lista de paradas. */
export function computeTripProgress(trip: DriverTrip): DriverTripProgress {
  let currentAssigned = false

  const segments = trip.stops.map((stop): DriverStopProgressSegment => {
    if (isStopResolved(stop)) {
      return { state: 'resolved', stopId: stop.id }
    }
    if (!currentAssigned) {
      currentAssigned = true
      return { state: 'current', stopId: stop.id }
    }
    return { state: 'pending', stopId: stop.id }
  })

  return {
    resolvedCount: segments.filter((segment) => segment.state === 'resolved').length,
    segments,
    totalCount: segments.length,
  }
}
