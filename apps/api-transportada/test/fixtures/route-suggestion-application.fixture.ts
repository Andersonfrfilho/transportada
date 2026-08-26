/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CreateRouteSuggestionRecord,
  DecideRouteSuggestionRecord,
  RouteSuggestionRecord,
} from '../../src/routing/application/route-suggestion.repository.js'
import type { RouteSuggestionDependencies } from '../../src/routing/application/route-suggestion.use-case.js'

export const TRIP_ID = '00000000-0000-4000-8000-000000000701'
export const SUGGESTION_ID = '00000000-0000-4000-8000-000000000702'
export const COMPANY_SCOPE = {
  companyId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
} as const

export const QUEUED_RECORD: RouteSuggestionRecord = {
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
  estimatedCostAmount: null,
  estimatedDistanceMeters: null,
  estimatedDurationSeconds: null,
  id: SUGGESTION_ID,
  seed: 12_345,
  status: 'queued',
  stops: [],
  tripId: TRIP_ID,
  truncated: false,
  updatedAt: '2026-08-26T12:00:00.000Z',
  vehicleId: null,
}

export const READY_RECORD: RouteSuggestionRecord = {
  ...QUEUED_RECORD,
  estimatedCostAmount: '184.5000',
  estimatedDistanceMeters: 24_000,
  estimatedDurationSeconds: 5_400,
  status: 'ready',
  stops: [
    buildStopRecord({ sequence: 1, stopId: 'stop-1' }),
    buildStopRecord({ sequence: 2, stopId: 'stop-2' }),
  ],
}

function buildStopRecord(
  overrides: Readonly<{ sequence: number; stopId: string | null }>,
): RouteSuggestionRecord['stops'][number] {
  return {
    addressKey: `3550308|0131010${overrides.sequence}|1000`,
    distanceFromPreviousMeters: 2_400,
    durationFromPreviousSeconds: 420,
    estimatedArrivalAt: '2026-08-26T13:00:00.000Z',
    excludedFromOptimization: false,
    geocodingPrecision: 'rooftop',
    label: `Parada ${overrides.sequence}`,
    sequence: overrides.sequence,
    serviceTimeSampleSize: null,
    serviceTimeSeconds: 600,
    serviceTimeSource: 'default',
    stopId: overrides.stopId,
    violations: [],
    weightEstimated: false,
  }
}

type FixtureParams = Readonly<{
  decideReturnsNull?: boolean
  onCreate?: () => void
  onPublish?: () => void
  reorderError?: Error
  seed?: number
  suggestion?: RouteSuggestionRecord
  tripAccepts?: boolean
  tripExists?: boolean
}>

export type RouteSuggestionFixture = RouteSuggestionDependencies &
  Readonly<{
    created: CreateRouteSuggestionRecord[]
    decided: DecideRouteSuggestionRecord[]
    published: { readonly suggestionId: string }[]
    reordered: { readonly orderedStopIds: readonly string[] }[]
  }>

export function buildDependencies(params: FixtureParams = {}): RouteSuggestionFixture {
  const created: CreateRouteSuggestionRecord[] = []
  const decided: DecideRouteSuggestionRecord[] = []
  const published: { readonly suggestionId: string }[] = []
  const reordered: { readonly orderedStopIds: readonly string[] }[] = []

  return {
    created,
    createSeed: () => params.seed ?? 1,
    decided,
    published,
    queue: {
      async publish(job) {
        params.onPublish?.()
        published.push({ suggestionId: job.suggestionId })
      },
    },
    reordered,
    repository: {
      async create(input) {
        params.onCreate?.()
        created.push(input)
        return { ...QUEUED_RECORD, seed: input.seed, assumptions: input.assumptions }
      },
      async decide(input) {
        if (params.decideReturnsNull === true) return null
        decided.push(input)
        return { ...(params.suggestion ?? QUEUED_RECORD), status: input.status }
      },
      async find() {
        return params.suggestion ?? null
      },
      async readSettings() {
        return {
          defaultServiceTimeSeconds: 600,
          duty: {
            breakEverySeconds: null,
            mandatoryBreakSeconds: null,
            maxDrivingSeconds: null,
            maxDutySeconds: null,
          },
          endAddressKey: '',
          endPolicy: 'depot',
          fallbackAverageSpeedKph: 30,
          fallbackWeightKilograms: '0.00',
          originAddressKey: '',
          serviceTimeMinimumSamples: 5,
          solverTimeBudgetSeconds: 30,
        }
      },
    },
    stopOrder: {
      async reorder(input) {
        if (params.reorderError !== undefined) throw params.reorderError
        reordered.push({ orderedStopIds: input.orderedStopIds })
      },
    },
    trips: {
      async readAcceptsRouting() {
        return {
          accepts: params.tripAccepts ?? true,
          exists: params.tripExists ?? true,
        }
      },
    },
  }
}
