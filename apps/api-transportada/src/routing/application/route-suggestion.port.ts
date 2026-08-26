/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision, GeocodingSource } from '../../database/geocoding.schema.js'
import type {
  RouteSuggestionStatus,
  ServiceTimeSource,
} from '../../database/route-suggestion.schema.js'
import type { RouteViolation } from '../domain/route-solver.types.js'

export type CompanyScope = Readonly<{ companyId: string; userId: string }>

/** O retrato da configuração que valia quando a sugestão rodou (ADR-0044 §5). */
export type RouteSuggestionAssumptions = Readonly<{
  endPolicy: string
  fallbackWeightKilograms: string
  originAddressKey: string
  serviceTimeSeconds: number
  serviceTimeSource: ServiceTimeSource
  solverTimeBudgetSeconds: number
  dutyEnabled: boolean
}>

export type RouteSuggestionStop = Readonly<{
  addressKey: string
  distanceFromPreviousMeters: number | null
  durationFromPreviousSeconds: number | null
  estimatedArrivalAt: string | null
  /** ADR-0044 §5: `city` sai da otimização e vai marcada para o fim, esperando decisão humana. */
  excludedFromOptimization: boolean
  geocodingPrecision: GeocodingPrecision | null
  label: string
  sequence: number
  serviceTimeSampleSize: number | null
  serviceTimeSeconds: number | null
  serviceTimeSource: ServiceTimeSource | null
  stopId: string | null
  violations: readonly RouteViolation[]
  /** Peso estimado porque a nota não informou — o conferente vê antes de aceitar. */
  weightEstimated: boolean
}>

export type RouteSuggestion = Readonly<{
  assumptions: RouteSuggestionAssumptions
  createdAt: string
  decidedAt: string | null
  errorCode: string
  estimatedCostAmount: string | null
  estimatedDistanceMeters: number | null
  estimatedDurationSeconds: number | null
  id: string
  seed: number
  status: RouteSuggestionStatus
  stops: readonly RouteSuggestionStop[]
  tripId: string | null
  truncated: boolean
  updatedAt: string
  vehicleId: string | null
}>

export type CreateRouteSuggestionInput = Readonly<{
  context: CompanyScope
  correlationId: string
  seed?: number | undefined
  solverTimeBudgetSeconds?: number | undefined
  tripId: string
  vehicleIds?: readonly string[] | undefined
}>

export type DecideRouteSuggestionInput = Readonly<{
  context: CompanyScope
  reason?: string | undefined
  suggestionId: string
  tripId: string
}>

export type ReadRouteSuggestionInput = Readonly<{
  context: CompanyScope
  suggestionId: string
  tripId: string
}>

export type CorrectGeocodedAddressInput = Readonly<{
  addressKey: string
  context: CompanyScope
  latitude: string
  longitude: string
}>

export type CorrectedGeocodedAddress = Readonly<{
  addressKey: string
  latitude: string
  longitude: string
  precision: GeocodingPrecision
  source: GeocodingSource
}>

export type RouteSuggestionUseCase = Readonly<{
  /**
   * ADR-0044 §7: responde `202` e devolve a sugestão em `queued` — o solver roda no worker, porque
   * um GA dentro do `Bun.serve` bloqueia o event loop e derruba o resto da API.
   */
  create: (input: CreateRouteSuggestionInput) => Promise<RouteSuggestion>
  read: (input: ReadRouteSuggestionInput) => Promise<RouteSuggestion>
  /**
   * O aceite **não escreve `trip_stops` por conta própria**: ele delega à mesma rota da 056
   * (`PATCH /trips/:id/stops/order`). A sugestão nunca escreve sozinha (ADR-0044 §5).
   */
  accept: (input: DecideRouteSuggestionInput) => Promise<RouteSuggestion>
  /** Rejeição também é gravada: é o que transforma "a sugestão está boa?" em número. */
  reject: (input: DecideRouteSuggestionInput) => Promise<RouteSuggestion>
}>

export type GeocodedAddressCorrectionUseCase = Readonly<{
  correct: (input: CorrectGeocodedAddressInput) => Promise<CorrectedGeocodedAddress>
}>
