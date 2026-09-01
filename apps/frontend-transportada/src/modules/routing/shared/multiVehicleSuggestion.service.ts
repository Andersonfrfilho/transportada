/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RouteSuggestion, RouteSuggestionStop } from './routeSuggestion.types'

/** Spec 058 P2: pedir roteiro é escrever viagem — a mesma permissão da sugestão de viagem única. */
export const ROUTE_SUGGESTION_MANAGE_PERMISSION = 'trip.manage'

export function canOpenMultiVehicleSuggestion(permissions: readonly string[]): boolean {
  return permissions.includes(ROUTE_SUGGESTION_MANAGE_PERMISSION)
}

export type MultiVehicleGroup = Readonly<{
  stops: readonly RouteSuggestionStop[]
  vehicleId: string
}>

/**
 * A tela mostra **uma coluna por veículo**, porque é essa a decisão que a multi-veículo toma: quem
 * leva o quê. Uma lista corrida com o veículo repetido em cada linha esconderia justamente isso.
 *
 * Parada sem veículo — a que ficou fora da otimização por precisão grosseira (ADR-0044 §5) — vai
 * para um grupo próprio, no fim, e **nunca some**: é ela que espera decisão humana.
 */
export const UNASSIGNED_GROUP = '' as const

export function groupStopsByVehicle(suggestion: RouteSuggestion): readonly MultiVehicleGroup[] {
  const groups = new Map<string, RouteSuggestionStop[]>()

  for (const stop of suggestion.stops) {
    const vehicleId = stop.vehicleId ?? UNASSIGNED_GROUP
    const current = groups.get(vehicleId) ?? []
    current.push(stop)
    groups.set(vehicleId, current)
  }

  const assigned = [...groups.entries()]
    .filter(([vehicleId]) => vehicleId !== UNASSIGNED_GROUP)
    .map(([vehicleId, stops]) => ({ stops, vehicleId }))
  const unassigned = groups.get(UNASSIGNED_GROUP)

  return unassigned === undefined
    ? assigned
    : [...assigned, { stops: unassigned, vehicleId: UNASSIGNED_GROUP }]
}

/**
 * Quantas viagens o aceite vai criar. É o número que o botão diz **antes** do clique: aceitar cria
 * viagem de verdade, e um botão que não avisa quantas transforma isso em surpresa.
 */
export function countProposedTrips(suggestion: RouteSuggestion): number {
  return groupStopsByVehicle(suggestion).filter((group) => group.vehicleId !== UNASSIGNED_GROUP)
    .length
}

/** Sem nota selecionada ou sem veículo escolhido não há o que pedir — e a API recusaria. */
export function canRequestMultiVehicle(input: {
  readonly documentIds: readonly string[]
  readonly vehicleIds: readonly string[]
}): boolean {
  return input.documentIds.length > 0 && input.vehicleIds.length > 0
}
