/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 225 D5: os trechos de `trips.planned_route` na forma que o rateio espera — `legs[i]` é o
 * trecho que **chega** a `stops[i]`.
 *
 * A rota congelada guarda a lista crua do roteirizador: a saída do barracão na frente e o retorno no
 * fim, quando existem (`depot.leadingLegs` / `depot.trailingLegs`). O retorno não é de parada
 * nenhuma — vem em `planned_return_distance_meters` —, e sem barracão o primeiro ponto É a primeira
 * parada: chegar a ela não custa trecho, então ela ganha um trecho vazio.
 */
import { parsePlannedRoute } from './parse-planned-route.policy.js'
import type { ApportionmentLeg } from './document-cost-apportionment.types.js'

const EMPTY_LEG: ApportionmentLeg = { distanceMetres: 0, durationSeconds: 0 }

/** Forma inesperada, ou rota sem trecho, vira lista vazia: o rateio trata como ausência. */
export function readApportionmentLegs(plannedRoute: unknown): readonly ApportionmentLeg[] {
  const route = parsePlannedRoute(plannedRoute)
  if (route === null || route.legs.length === 0) return []

  const { leadingLegs, trailingLegs } = readDepotLegCounts(plannedRoute)
  if (leadingLegs + trailingLegs > route.legs.length) return []

  const travelled = route.legs.slice(0, route.legs.length - trailingLegs)

  return leadingLegs === 0 ? [EMPTY_LEG, ...travelled] : travelled
}

function readDepotLegCounts(plannedRoute: unknown): {
  readonly leadingLegs: number
  readonly trailingLegs: number
} {
  const depot = (plannedRoute as Record<string, unknown>).depot
  if (typeof depot !== 'object' || depot === null) return { leadingLegs: 0, trailingLegs: 0 }
  const record = depot as Record<string, unknown>

  return {
    leadingLegs: toLegCount(record.leadingLegs),
    trailingLegs: toLegCount(record.trailingLegs),
  }
}

function toLegCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}
