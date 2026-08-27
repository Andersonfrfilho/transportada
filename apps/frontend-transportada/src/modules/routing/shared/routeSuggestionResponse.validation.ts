/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  GEOCODING_PRECISION,
  ROUTE_SUGGESTION_STATUS,
  ROUTE_VIOLATION_KIND,
  SERVICE_TIME_SOURCE,
  type RouteSuggestion,
  type RouteSuggestionStop,
  type RouteViolation,
} from './routeSuggestion.types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function isNullableNumber(value: unknown): value is null | number {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return isString(value) && options.includes(value as TOption)
}

/**
 * A resposta da API é entrada não confiável como qualquer outra (`security.md` §3), e este é o único
 * lugar onde ela vira tipo. Devolver `null` em vez de lançar deixa o chamador decidir — e ele
 * decide mostrar "resposta inválida", nunca renderizar um roteiro pela metade.
 */
export function toRouteSuggestion(value: unknown): RouteSuggestion | null {
  if (!isRecord(value)) return null

  const stops = toStops(value.stops)
  const assumptions = toAssumptions(value.assumptions)
  if (stops === null || assumptions === null) return null

  const isValid =
    isString(value.createdAt) &&
    isNullableString(value.decidedAt) &&
    isString(value.errorCode) &&
    isNullableString(value.estimatedCostAmount) &&
    isNullableNumber(value.estimatedDistanceMeters) &&
    isNullableNumber(value.estimatedDurationSeconds) &&
    isString(value.id) &&
    typeof value.seed === 'number' &&
    isOneOf(value.status, ROUTE_SUGGESTION_STATUS) &&
    isNullableString(value.tripId) &&
    typeof value.truncated === 'boolean' &&
    isString(value.updatedAt) &&
    isNullableString(value.vehicleId)

  if (!isValid) return null

  return {
    assumptions,
    createdAt: value.createdAt as string,
    decidedAt: value.decidedAt as null | string,
    errorCode: value.errorCode as string,
    estimatedCostAmount: value.estimatedCostAmount as null | string,
    estimatedDistanceMeters: value.estimatedDistanceMeters as null | number,
    estimatedDurationSeconds: value.estimatedDurationSeconds as null | number,
    id: value.id as string,
    seed: value.seed as number,
    status: value.status as RouteSuggestion['status'],
    stops,
    tripId: value.tripId as null | string,
    truncated: value.truncated as boolean,
    updatedAt: value.updatedAt as string,
    vehicleId: value.vehicleId as null | string,
  }
}

function toAssumptions(value: unknown): RouteSuggestion['assumptions'] | null {
  if (!isRecord(value)) return null

  const isValid =
    typeof value.dutyEnabled === 'boolean' &&
    isString(value.endPolicy) &&
    isString(value.fallbackWeightKilograms) &&
    isString(value.originAddressKey) &&
    typeof value.serviceTimeSeconds === 'number' &&
    isOneOf(value.serviceTimeSource, SERVICE_TIME_SOURCE) &&
    typeof value.solverTimeBudgetSeconds === 'number'

  if (!isValid) return null

  return {
    dutyEnabled: value.dutyEnabled as boolean,
    endPolicy: value.endPolicy as string,
    fallbackWeightKilograms: value.fallbackWeightKilograms as string,
    originAddressKey: value.originAddressKey as string,
    serviceTimeSeconds: value.serviceTimeSeconds as number,
    serviceTimeSource:
      value.serviceTimeSource as RouteSuggestion['assumptions']['serviceTimeSource'],
    solverTimeBudgetSeconds: value.solverTimeBudgetSeconds as number,
  }
}

function toStops(value: unknown): readonly RouteSuggestionStop[] | null {
  if (!Array.isArray(value)) return null

  const stops: RouteSuggestionStop[] = []
  for (const entry of value) {
    const stop = toStop(entry)
    // Uma parada inválida invalida o roteiro inteiro: meia lista é uma ordem que ninguém propôs
    if (stop === null) return null
    stops.push(stop)
  }

  return stops
}

function toStop(value: unknown): RouteSuggestionStop | null {
  if (!isRecord(value)) return null

  const violations = toViolations(value.violations)
  if (violations === null) return null

  const isValid =
    isString(value.addressKey) &&
    isNullableNumber(value.distanceFromPreviousMeters) &&
    isNullableNumber(value.durationFromPreviousSeconds) &&
    isNullableString(value.estimatedArrivalAt) &&
    typeof value.excludedFromOptimization === 'boolean' &&
    (value.geocodingPrecision === null || isOneOf(value.geocodingPrecision, GEOCODING_PRECISION)) &&
    isString(value.label) &&
    typeof value.sequence === 'number' &&
    isNullableNumber(value.serviceTimeSampleSize) &&
    isNullableNumber(value.serviceTimeSeconds) &&
    (value.serviceTimeSource === null || isOneOf(value.serviceTimeSource, SERVICE_TIME_SOURCE)) &&
    isNullableString(value.stopId) &&
    typeof value.weightEstimated === 'boolean'

  if (!isValid) return null

  return {
    addressKey: value.addressKey as string,
    distanceFromPreviousMeters: value.distanceFromPreviousMeters as null | number,
    durationFromPreviousSeconds: value.durationFromPreviousSeconds as null | number,
    estimatedArrivalAt: value.estimatedArrivalAt as null | string,
    excludedFromOptimization: value.excludedFromOptimization as boolean,
    geocodingPrecision: value.geocodingPrecision as RouteSuggestionStop['geocodingPrecision'],
    label: value.label as string,
    /** A coordenada é opcional na resposta: parada sem geocodificação ainda é parada. */
    latitude: isNullableString(value.latitude) ? value.latitude : null,
    longitude: isNullableString(value.longitude) ? value.longitude : null,
    sequence: value.sequence as number,
    serviceTimeSampleSize: value.serviceTimeSampleSize as null | number,
    serviceTimeSeconds: value.serviceTimeSeconds as null | number,
    serviceTimeSource: value.serviceTimeSource as RouteSuggestionStop['serviceTimeSource'],
    stopId: value.stopId as null | string,
    /**
     * Opcional na leitura, como a coordenada: sugestão gravada antes da P2 não tem o campo, e
     * recusá-la faria a tela deixar de mostrar roteiro que já existe.
     */
    vehicleId: isNullableString(value.vehicleId) ? value.vehicleId : null,
    violations,
    weightEstimated: value.weightEstimated as boolean,
  }
}

function toViolations(value: unknown): readonly RouteViolation[] | null {
  if (!Array.isArray(value)) return null

  const violations: RouteViolation[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return null
    const isValid =
      typeof entry.amount === 'number' &&
      isOneOf(entry.kind, ROUTE_VIOLATION_KIND) &&
      isNullableNumber(entry.stopIndex) &&
      isString(entry.vehicleId)

    if (!isValid) return null

    violations.push({
      amount: entry.amount as number,
      kind: entry.kind as RouteViolation['kind'],
      stopIndex: entry.stopIndex as null | number,
      vehicleId: entry.vehicleId as string,
    })
  }

  return violations
}
