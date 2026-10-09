/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.3: a resposta do roteirizador com as paradas e a chegada prevista de cada uma, e o cliente dublado que a
 * devolve pronta. Só dados fictícios.
 */
import type { RouteSuggestionClient } from '@/modules/routing/shared/routeSuggestionClient.service'
import type { RouteSuggestion } from '@/modules/routing/shared/routeSuggestion.types'
import type { AssemblyMapPoint } from '@/modules/trip/shared/assemblyMap.service'

export type SolverStopInput = Readonly<{
  addressKey: string
  estimatedArrivalAt: null | string
  sequence: number
}>

export function buildSolverSuggestion(
  stops: readonly SolverStopInput[],
  status: RouteSuggestion['status'] = 'ready',
): RouteSuggestion {
  return {
    errorCode: status === 'failed' ? 'solver_failed' : '',
    estimatedDistanceMeters: 88_600,
    estimatedDurationSeconds: 5_400,
    id: 'suggestion-1',
    status,
    stops: stops.map((stop) => ({
      ...stop,
      distanceFromPreviousMeters: null,
      durationFromPreviousSeconds: null,
      excludedFromOptimization: false,
      geocodingPrecision: null,
      label: stop.addressKey,
      latitude: null,
      longitude: null,
      serviceTimeSampleSize: null,
      serviceTimeSeconds: null,
      serviceTimeSource: null,
      stopId: null,
      vehicleId: null,
      violations: [],
      weightEstimated: false,
    })),
  } as unknown as RouteSuggestion
}

/** O cliente do roteirizador que só sabe criar e ler: a sugestão já nasce assentada. */
export function buildSolverClient(suggestion: RouteSuggestion): RouteSuggestionClient {
  return {
    createMultiVehicle: () => Promise.resolve(suggestion),
    readMultiVehicle: () => Promise.resolve(suggestion),
  } as unknown as RouteSuggestionClient
}

export function buildAssemblyPoint(
  input: Readonly<{ id: string; stopKey: string }>,
): AssemblyMapPoint {
  return {
    cityCode: input.stopKey.split('|')[0] ?? '',
    isApproximate: false,
    label: 'Campinas/SP',
    latitude: -22.9,
    longitude: -47.06,
    notes: [{ id: input.id }],
    sequence: 1,
    stopKey: input.stopKey,
    x: 0,
    y: 0,
  } as unknown as AssemblyMapPoint
}
