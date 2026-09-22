/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A leitura defensiva de `trips.planned_route` (spec 153 T201): a coluna é jsonb sem `.$type<>()`,
 * então o Drizzle devolve `unknown` — e forma inesperada vira ausência, nunca meio preenchida. Mesmo
 * idioma de `parseTollRouteCost` (T5 da spec 090) para o jsonb de pedágio congelado.
 */
import { ROUTE_CHOICE_CRITERIA, type RouteChoiceCriterion } from './route-choice.policy.js'

export type ParsedRouteLeg = Readonly<{ distanceMetres: number; durationSeconds: number }>
export type ParsedRoutePoint = Readonly<{ latitude: string; longitude: string }>

export type ParsedPlannedRoute = Readonly<{
  choiceReproduced: boolean
  criterion: RouteChoiceCriterion
  legs: readonly ParsedRouteLeg[]
  points: readonly ParsedRoutePoint[]
  signature: null | string
}>

const ROUTE_CHOICE_CRITERION_SET: ReadonlySet<string> = new Set(ROUTE_CHOICE_CRITERIA)

export function parsePlannedRoute(value: unknown): null | ParsedPlannedRoute {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.choiceReproduced !== 'boolean') return null
  if (!isRouteChoiceCriterion(record.criterion)) return null
  if (!isNullableString(record.signature)) return null

  const legs = parseLegs(record.legs)
  if (legs === null) return null
  const points = parsePoints(record.points)
  if (points === null) return null

  return {
    choiceReproduced: record.choiceReproduced,
    criterion: record.criterion,
    legs,
    points,
    signature: record.signature,
  }
}

function isRouteChoiceCriterion(value: unknown): value is RouteChoiceCriterion {
  return typeof value === 'string' && ROUTE_CHOICE_CRITERION_SET.has(value)
}

function isNullableString(value: unknown): value is null | string {
  return value === null || typeof value === 'string'
}

function parseLegs(value: unknown): null | readonly ParsedRouteLeg[] {
  if (!Array.isArray(value)) return null
  const legs: ParsedRouteLeg[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null
    const leg = item as Record<string, unknown>
    if (typeof leg.distanceMetres !== 'number' || typeof leg.durationSeconds !== 'number')
      return null
    legs.push({ distanceMetres: leg.distanceMetres, durationSeconds: leg.durationSeconds })
  }
  return legs
}

function parsePoints(value: unknown): null | readonly ParsedRoutePoint[] {
  if (!Array.isArray(value)) return null
  const points: ParsedRoutePoint[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null
    const point = item as Record<string, unknown>
    if (typeof point.latitude !== 'string' || typeof point.longitude !== 'string') return null
    points.push({ latitude: point.latitude, longitude: point.longitude })
  }
  return points
}
