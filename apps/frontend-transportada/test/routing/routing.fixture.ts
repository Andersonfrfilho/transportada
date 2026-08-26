/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  RouteSuggestion,
  RouteSuggestionStop,
} from '../../src/modules/routing/shared/routeSuggestion.types'

export const TRIP_ID = '00000000-0000-4000-8000-000000000701'
export const SUGGESTION_ID = '00000000-0000-4000-8000-000000000702'

export function buildStop(
  overrides: Partial<RouteSuggestionStop> & Pick<RouteSuggestionStop, 'sequence'>,
): RouteSuggestionStop {
  return {
    addressKey: `3550308|0131010${overrides.sequence}|1000`,
    distanceFromPreviousMeters: 2_400,
    durationFromPreviousSeconds: 420,
    estimatedArrivalAt: '2026-08-26T13:00:00.000Z',
    excludedFromOptimization: false,
    geocodingPrecision: 'rooftop',
    label: `Parada ${overrides.sequence}`,
    latitude: '-23.5613090',
    longitude: '-46.6564870',
    serviceTimeSampleSize: null,
    serviceTimeSeconds: 600,
    serviceTimeSource: 'default',
    stopId: null,
    violations: [],
    weightEstimated: false,
    ...overrides,
  }
}

export const READY_SUGGESTION: RouteSuggestion = {
  assumptions: {
    dutyEnabled: false,
    endPolicy: 'depot',
    fallbackWeightKilograms: '0.00',
    originAddressKey: '',
    serviceTimeSeconds: 600,
    serviceTimeSource: 'default',
    solverTimeBudgetSeconds: 30,
  },
  createdAt: '2026-08-26T12:00:00.000Z',
  decidedAt: null,
  errorCode: '',
  estimatedCostAmount: '184.5000',
  estimatedDistanceMeters: 24_000,
  estimatedDurationSeconds: 5_400,
  id: SUGGESTION_ID,
  seed: 12_345,
  status: 'ready',
  stops: [buildStop({ sequence: 1 }), buildStop({ sequence: 2 })],
  tripId: TRIP_ID,
  truncated: false,
  updatedAt: '2026-08-26T12:01:00.000Z',
  vehicleId: null,
}
