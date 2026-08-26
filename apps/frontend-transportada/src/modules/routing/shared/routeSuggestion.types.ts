/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Cópia por valor do que a API valida (ADR-0044). O bundle não carrega código dela, e a paridade é
 * contrato de teste — o mesmo arranjo que `fleet.types.ts` já usa.
 */
export const ROUTE_SUGGESTION_STATUS = [
  'accepted',
  'failed',
  'queued',
  'ready',
  'rejected',
  'running',
  'stale',
] as const
export type RouteSuggestionStatus = (typeof ROUTE_SUGGESTION_STATUS)[number]

export const GEOCODING_PRECISION = ['city', 'postal_code', 'rooftop', 'street'] as const
export type GeocodingPrecision = (typeof GEOCODING_PRECISION)[number]

export const ROUTE_VIOLATION_KIND = [
  'delivery_window',
  'duty_time',
  'unreachable',
  'weight',
] as const
export type RouteViolationKind = (typeof ROUTE_VIOLATION_KIND)[number]

export const SERVICE_TIME_SOURCE = ['default', 'measured'] as const
export type ServiceTimeSource = (typeof SERVICE_TIME_SOURCE)[number]

export type RouteViolation = Readonly<{
  /** Quanto falta — quilos, segundos. Número, nunca "estourou": o operador precisa da medida. */
  amount: number
  kind: RouteViolationKind
  stopIndex: number | null
  vehicleId: string
}>

export type RouteSuggestionStop = Readonly<{
  addressKey: string
  distanceFromPreviousMeters: number | null
  durationFromPreviousSeconds: number | null
  estimatedArrivalAt: string | null
  /** Precisão `city` sai da otimização e vai marcada para o fim (ADR-0044 §5). */
  excludedFromOptimization: boolean
  geocodingPrecision: GeocodingPrecision | null
  label: string
  latitude: string | null
  longitude: string | null
  sequence: number
  serviceTimeSampleSize: number | null
  serviceTimeSeconds: number | null
  serviceTimeSource: ServiceTimeSource | null
  stopId: string | null
  violations: readonly RouteViolation[]
  /** A nota não informou peso: entrou com o médio da empresa, e isso aparece antes do aceite. */
  weightEstimated: boolean
}>

export type RouteSuggestionAssumptions = Readonly<{
  dutyEnabled: boolean
  endPolicy: string
  fallbackWeightKilograms: string
  originAddressKey: string
  serviceTimeSeconds: number
  serviceTimeSource: ServiceTimeSource
  solverTimeBudgetSeconds: number
}>

export type RouteSuggestion = Readonly<{
  assumptions: RouteSuggestionAssumptions
  createdAt: string
  decidedAt: null | string
  errorCode: string
  estimatedCostAmount: null | string
  estimatedDistanceMeters: null | number
  estimatedDurationSeconds: null | number
  id: string
  seed: number
  status: RouteSuggestionStatus
  stops: readonly RouteSuggestionStop[]
  tripId: null | string
  /** O orçamento cortou antes da convergência — a resposta é o melhor encontrado, e ela diz isso. */
  truncated: boolean
  updatedAt: string
  vehicleId: null | string
}>
