/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import {
  companyRouteOptimizationSettings,
  routeSuggestionStops,
  routeSuggestions,
} from '../../database/database.schema.js'
import type {
  RouteOptimizationSettings,
  RouteSuggestionRecord,
  RouteSuggestionRepository,
  RouteSuggestionStopRecord,
} from '../application/route-suggestion.repository.js'

export type RouteSuggestionDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * O padrão da empresa que ainda não configurou nada. Ele existe em código, e não como linha semeada,
 * porque empresa nova não pode depender de um seed ter rodado para pedir sugestão — e porque o valor
 * ausente aqui é "não é restrição", não "zero".
 */
const DEFAULT_SETTINGS: RouteOptimizationSettings = {
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

export function createDrizzleRouteSuggestionRepository(
  database: RouteSuggestionDatabase,
): RouteSuggestionRepository {
  return {
    async create(input) {
      const [row] = await database
        .insert(routeSuggestions)
        .values({
          assumptions: input.assumptions,
          companyId: input.companyId,
          seed: input.seed,
          status: 'queued',
          tripId: input.tripId,
          ...(input.vehicleId === null ? {} : { vehicleId: input.vehicleId }),
        })
        .returning()

      if (row === undefined) throw new Error('route suggestion insert returned no row')

      return toRecord({ row, stops: [] })
    },

    async find({ companyId, suggestionId }) {
      const [row] = await database
        .select()
        .from(routeSuggestions)
        .where(
          and(eq(routeSuggestions.companyId, companyId), eq(routeSuggestions.id, suggestionId)),
        )
        .limit(1)

      if (row === undefined) return null

      const stops = await database
        .select()
        .from(routeSuggestionStops)
        .where(
          and(
            eq(routeSuggestionStops.companyId, companyId),
            eq(routeSuggestionStops.suggestionId, suggestionId),
          ),
        )
        .orderBy(routeSuggestionStops.sequence)

      return toRecord({ row, stops })
    },

    /**
     * A decisão só se aplica sobre `ready`, e a condição vive no `where` — não num `select` seguido
     * de `update`. Dois cliques no botão de aceitar são dois pedidos concorrentes, e sem isso os dois
     * passariam: o roteiro seria escrito duas vezes, e a segunda gravaria um `decided_at` que
     * contradiz o primeiro.
     */
    async decide({ companyId, decidedByUserId, status, suggestionId }) {
      const [row] = await database
        .update(routeSuggestions)
        .set({ decidedAt: sql`now()`, decidedByUserId, status, updatedAt: sql`now()` })
        .where(
          and(
            eq(routeSuggestions.companyId, companyId),
            eq(routeSuggestions.id, suggestionId),
            eq(routeSuggestions.status, 'ready'),
          ),
        )
        .returning()

      return row === undefined ? null : toRecord({ row, stops: [] })
    },

    async readSettings(companyId) {
      const [row] = await database
        .select()
        .from(companyRouteOptimizationSettings)
        .where(eq(companyRouteOptimizationSettings.companyId, companyId))
        .limit(1)

      if (row === undefined) return DEFAULT_SETTINGS

      return {
        defaultServiceTimeSeconds: row.defaultServiceTimeSeconds,
        duty: {
          breakEverySeconds: row.breakEverySeconds,
          mandatoryBreakSeconds: row.mandatoryBreakSeconds,
          maxDrivingSeconds: row.maxDrivingSecondsPerDay,
          maxDutySeconds: row.maxDutySecondsPerDay,
        },
        endAddressKey: row.endAddressKey,
        endPolicy: row.endPolicy,
        fallbackAverageSpeedKph: row.fallbackAverageSpeedKph,
        fallbackWeightKilograms: row.fallbackWeightKilograms,
        originAddressKey: row.originAddressKey,
        serviceTimeMinimumSamples: row.serviceTimeMinimumSamples,
        solverTimeBudgetSeconds: row.solverTimeBudgetSeconds,
      }
    },
  }
}

type SuggestionRow = typeof routeSuggestions.$inferSelect
type StopRow = typeof routeSuggestionStops.$inferSelect

function toRecord(input: {
  readonly row: SuggestionRow
  readonly stops: readonly StopRow[]
}): RouteSuggestionRecord {
  return {
    /**
     * `jsonb` volta como `unknown`, e é aqui — na fronteira do banco — que ele reganha forma. O
     * CHECK da tabela não descreve o conteúdo do documento, então esta é a única asserção honesta:
     * ela fica no adaptador, não vaza para o caso de uso.
     */
    assumptions: input.row.assumptions as RouteSuggestionRecord['assumptions'],
    createdAt: input.row.createdAt.toISOString(),
    decidedAt: input.row.decidedAt?.toISOString() ?? null,
    errorCode: input.row.errorCode,
    estimatedCostAmount: input.row.estimatedCostAmount,
    estimatedDistanceMeters: input.row.estimatedDistanceMeters,
    estimatedDurationSeconds: input.row.estimatedDurationSeconds,
    id: input.row.id,
    seed: input.row.seed,
    status: input.row.status,
    stops: input.stops.map(toStopRecord),
    tripId: input.row.tripId,
    truncated: input.row.truncated,
    updatedAt: input.row.updatedAt.toISOString(),
    vehicleId: input.row.vehicleId,
  }
}

function toStopRecord(row: StopRow): RouteSuggestionStopRecord {
  return {
    addressKey: row.addressKey,
    distanceFromPreviousMeters: row.distanceFromPreviousMeters,
    durationFromPreviousSeconds: row.durationFromPreviousSeconds,
    estimatedArrivalAt: row.estimatedArrivalAt?.toISOString() ?? null,
    excludedFromOptimization: row.excludedFromOptimization,
    geocodingPrecision: row.geocodingPrecision,
    label: row.label,
    sequence: Number(row.sequence),
    serviceTimeSampleSize: row.serviceTimeSampleSize,
    serviceTimeSeconds: row.serviceTimeSeconds,
    serviceTimeSource: row.serviceTimeSource,
    stopId: row.stopId,
    vehicleId: row.vehicleId,
    violations: row.violations as RouteSuggestionStopRecord['violations'],
    weightEstimated: row.weightEstimated,
  }
}
