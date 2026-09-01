/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'
import type {
  RouteEndPolicy,
  RouteSuggestionStatus,
  ServiceTimeSource,
} from '../../database/route-suggestion.schema.js'
import type { RouteDutyLimits, RouteViolation } from '../domain/route-solver.types.js'
import type {
  RouteSuggestion,
  RouteSuggestionAssumptions,
  RouteSuggestionStop,
} from './route-suggestion.port.js'

/**
 * O registro **é** a sugestão: definir a forma duas vezes — uma na porta, outra aqui — produziria
 * dois tipos estruturalmente iguais e mutuamente incompatíveis, que é exatamente o que o TypeScript
 * acusa quando alguém tenta passar um pelo outro.
 */
export type RouteSuggestionStopRecord = RouteSuggestionStop
export type RouteSuggestionRecord = RouteSuggestion

/** Spec 058 RF-7. Todo limite de jornada anulável — nulo é "não é restrição aqui" (D6b). */
export type RouteOptimizationSettings = Readonly<{
  defaultServiceTimeSeconds: number
  duty: RouteDutyLimits
  endAddressKey: string
  endPolicy: RouteEndPolicy
  fallbackAverageSpeedKph: number
  fallbackWeightKilograms: string
  originAddressKey: string
  serviceTimeMinimumSamples: number
  solverTimeBudgetSeconds: number
}>

export type CreateRouteSuggestionRecord = Readonly<{
  assumptions: RouteSuggestionAssumptions
  companyId: string
  seed: number
  tripId: string
  vehicleId: string | null
}>

export type DecideRouteSuggestionRecord = Readonly<{
  companyId: string
  decidedByUserId: string
  status: Extract<RouteSuggestionStatus, 'accepted' | 'rejected'>
  suggestionId: string
}>

export type RouteSuggestionRepository = Readonly<{
  create: (input: CreateRouteSuggestionRecord) => Promise<RouteSuggestionRecord>
  /**
   * `null` quando a sugestão não estava `ready`: já foi decidida, ainda está na fila, ou a viagem
   * mudou. Quem chama transforma isso no erro certo — o repositório não decide status HTTP.
   */
  decide: (input: DecideRouteSuggestionRecord) => Promise<RouteSuggestionRecord | null>
  find: (input: {
    readonly companyId: string
    readonly suggestionId: string
  }) => Promise<RouteSuggestionRecord | null>
  readSettings: (companyId: string) => Promise<RouteOptimizationSettings>
}>

/** O que o worker escreve quando termina — ou quando falha, que é a outra metade do contrato. */
export type CompleteRouteSuggestionRecord = Readonly<{
  companyId: string
  estimatedCostAmount: string
  estimatedDistanceMeters: number
  estimatedDurationSeconds: number
  solverMetrics: unknown
  stops: readonly SolvedRouteSuggestionStop[]
  suggestionId: string
  truncated: boolean
}>

export type SolvedRouteSuggestionStop = Readonly<{
  addressKey: string
  distanceFromPreviousMeters: number | null
  durationFromPreviousSeconds: number | null
  estimatedArrivalAt: Date | null
  excludedFromOptimization: boolean
  geocodingPrecision: GeocodingPrecision | null
  label: string
  sequence: number
  serviceTimeSampleSize: number | null
  serviceTimeSeconds: number | null
  serviceTimeSource: ServiceTimeSource | null
  stopId: string | null
  violations: readonly RouteViolation[]
  weightEstimated: boolean
}>
