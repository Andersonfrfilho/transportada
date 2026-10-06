/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DEFAULT_ROUTE_CHOICE, type RouteChoice } from './routeGeometry.service'

/**
 * A escolha de rota deste veículo na proposta — nunca a de outro. D7: o mapa da proposta grava por
 * veículo, e cada leitura aqui é isolada da dos demais; veículo ausente cai no padrão (mais rápida).
 */
export function resolveVehicleRouteChoice(
  input: Readonly<{ routeChoiceByVehicle: ReadonlyMap<string, RouteChoice>; vehicleId: string }>,
): RouteChoice {
  return input.routeChoiceByVehicle.get(input.vehicleId) ?? DEFAULT_ROUTE_CHOICE
}

/**
 * O que o aceite manda por veículo — sempre um item por veículo aceito, nunca omitido (D1): quem
 * nunca tocou o seletor ainda manda o padrão explícito.
 */
export function resolveAcceptedRouteChoices(
  input: Readonly<{
    routeChoiceByVehicle: ReadonlyMap<string, RouteChoice>
    vehicleIds: readonly string[]
  }>,
): readonly Readonly<{ routeChoice: RouteChoice; vehicleId: string }>[] {
  return input.vehicleIds.map((vehicleId) => ({
    routeChoice: resolveVehicleRouteChoice({
      routeChoiceByVehicle: input.routeChoiceByVehicle,
      vehicleId,
    }),
    vehicleId,
  }))
}
