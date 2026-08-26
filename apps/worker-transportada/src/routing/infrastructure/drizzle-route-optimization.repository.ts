/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import {
  companyRouteOptimizationSettings,
  fleetVehicles,
  geocodedAddresses,
  routeSuggestionStops,
  routeSuggestions,
  tripStops,
  trips,
} from '../../database/routing.schema.js'
import type {
  RouteOptimizationContext,
  RouteOptimizationOutcome,
  RouteOptimizationStop,
} from '../application/route-optimization.effect.js'
import type {
  RouteOptimizationHandlerPorts,
  RouteOptimizationJob,
} from '../application/route-optimization-handler.service.js'

export type RouteOptimizationDatabase = ReturnType<typeof createDrizzleProvider>['db']

const MICROS_PER_UNIT = 1_000_000
const METRES_PER_KILOMETRE = 1_000
const SECONDS_PER_DAY = 86_400

/** O mesmo padrão que a API aplica a empresa sem configuração — as duas leem a mesma ausência. */
const DEFAULT_SETTINGS = {
  defaultServiceTimeSeconds: 600,
  endAddressKey: '',
  endPolicy: 'depot',
  fallbackWeightKilograms: '0.00',
  originAddressKey: '',
  solverTimeBudgetSeconds: 30,
} as const

export type RouteOptimizationRepository = Pick<
  RouteOptimizationHandlerPorts,
  'claim' | 'complete' | 'fail'
> &
  Readonly<{ readContext: (job: RouteOptimizationJob) => Promise<RouteOptimizationContext | null> }>

export function createDrizzleRouteOptimizationRepository(
  database: RouteOptimizationDatabase,
): RouteOptimizationRepository {
  return {
    /**
     * A reserva é `queued → running` **no `where`**. Dois consumidores recebendo a mesma mensagem —
     * o que acontece numa reentrega — só podem trabalhar se um deles vencer aqui; sem isso, os dois
     * rodariam o solver e o segundo sobrescreveria o resultado do primeiro.
     */
    async claim(job) {
      const [row] = await database
        .update(routeSuggestions)
        .set({ status: 'running', updatedAt: sql`now()` })
        .where(
          and(
            eq(routeSuggestions.companyId, job.companyId),
            eq(routeSuggestions.id, job.suggestionId),
            eq(routeSuggestions.status, 'queued'),
          ),
        )
        .returning({ id: routeSuggestions.id })

      return row === undefined ? null : { suggestionId: row.id }
    },

    async readContext(job) {
      const [suggestion] = await database
        .select()
        .from(routeSuggestions)
        .where(
          and(
            eq(routeSuggestions.companyId, job.companyId),
            eq(routeSuggestions.id, job.suggestionId),
          ),
        )
        .limit(1)

      if (suggestion?.tripId == null) return null

      const settings = await readSettings({ companyId: job.companyId, database })
      const stops = await readStops({
        companyId: job.companyId,
        database,
        defaultServiceTimeSeconds: settings.defaultServiceTimeSeconds,
        fallbackWeightKilograms: settings.fallbackWeightKilograms,
        tripId: suggestion.tripId,
      })
      const vehicles = await readVehicles({
        companyId: job.companyId,
        database,
        tripId: suggestion.tripId,
      })

      const depot = await readPoint({ addressKey: settings.originAddressKey, database })

      return {
        companyId: job.companyId,
        /**
         * A janela da parada é absoluta no banco e relativa no solver. A meia-noite UTC do dia da
         * sugestão é a origem: qualquer outra escolha faria a mesma viagem produzir janelas
         * diferentes conforme a hora em que alguém apertou o botão.
         */
        dayStartEpochSeconds: startOfUtcDaySeconds(new Date()),
        depot,
        duty: {
          breakEverySeconds: settings.breakEverySeconds,
          mandatoryBreakSeconds: settings.mandatoryBreakSeconds,
          maxDrivingSeconds: settings.maxDrivingSecondsPerDay,
          maxDutySeconds: settings.maxDutySecondsPerDay,
        },
        end:
          settings.endPolicy === 'depot'
            ? depot
            : settings.endPolicy === 'address'
              ? await readPoint({ addressKey: settings.endAddressKey, database })
              : null,
        seed: suggestion.seed,
        solverTimeBudgetSeconds: readBudget(
          suggestion.assumptions,
          settings.solverTimeBudgetSeconds,
        ),
        stops,
        vehicles,
      }
    },

    /**
     * O resultado entra numa transação: paradas e estimativas são a mesma resposta, e uma sugestão
     * `ready` sem paradas seria uma proposta vazia que a tela mostraria como roteiro.
     */
    async complete({ job, outcome }) {
      await database.transaction(async (transaction) => {
        await transaction
          .delete(routeSuggestionStops)
          .where(
            and(
              eq(routeSuggestionStops.companyId, job.companyId),
              eq(routeSuggestionStops.suggestionId, job.suggestionId),
            ),
          )

        if (outcome.orderedStops.length > 0) {
          await transaction.insert(routeSuggestionStops).values(
            outcome.orderedStops.map((stop) => ({
              addressKey: stop.addressKey,
              companyId: job.companyId,
              distanceFromPreviousMeters: stop.distanceFromPreviousMeters,
              durationFromPreviousSeconds: stop.durationFromPreviousSeconds,
              estimatedArrivalAt: stop.estimatedArrivalAt,
              excludedFromOptimization: stop.excludedFromOptimization,
              label: stop.label,
              sequence: BigInt(stop.sequence),
              serviceTimeSeconds: stop.serviceTimeSeconds,
              serviceTimeSource: 'default',
              stopId: stop.stopId,
              suggestionId: job.suggestionId,
              violations: stop.violations,
              weightEstimated: stop.weightEstimated,
            })),
          )
        }

        await transaction
          .update(routeSuggestions)
          .set({
            estimatedCostAmount: outcome.estimatedCostAmount,
            estimatedDistanceMeters: outcome.estimatedDistanceMeters,
            estimatedDurationSeconds: outcome.estimatedDurationSeconds,
            solverMetrics: outcome.solverMetrics,
            status: 'ready',
            truncated: outcome.truncated,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(routeSuggestions.companyId, job.companyId),
              eq(routeSuggestions.id, job.suggestionId),
            ),
          )
      })
    },

    async fail({ errorCode, job }) {
      await database
        .update(routeSuggestions)
        .set({ errorCode, status: 'failed', updatedAt: sql`now()` })
        .where(
          and(
            eq(routeSuggestions.companyId, job.companyId),
            eq(routeSuggestions.id, job.suggestionId),
          ),
        )
    },
  }
}

async function readSettings(input: {
  readonly companyId: string
  readonly database: RouteOptimizationDatabase
}) {
  const [row] = await input.database
    .select()
    .from(companyRouteOptimizationSettings)
    .where(eq(companyRouteOptimizationSettings.companyId, input.companyId))
    .limit(1)

  return {
    ...DEFAULT_SETTINGS,
    breakEverySeconds: row?.breakEverySeconds ?? null,
    mandatoryBreakSeconds: row?.mandatoryBreakSeconds ?? null,
    maxDrivingSecondsPerDay: row?.maxDrivingSecondsPerDay ?? null,
    maxDutySecondsPerDay: row?.maxDutySecondsPerDay ?? null,
    ...(row === undefined
      ? {}
      : {
          defaultServiceTimeSeconds: row.defaultServiceTimeSeconds,
          endAddressKey: row.endAddressKey,
          endPolicy: row.endPolicy,
          fallbackWeightKilograms: row.fallbackWeightKilograms,
          originAddressKey: row.originAddressKey,
          solverTimeBudgetSeconds: row.solverTimeBudgetSeconds,
        }),
  }
}

/**
 * A parada só entra na otimização com coordenada **fina**. Sem geocodificação, ou com centroide de
 * município, ela é marcada e sai — pedi-la ao OSRM gastaria um palpite de quilômetros (ADR-0044 §5).
 */
async function readStops(input: {
  readonly companyId: string
  readonly database: RouteOptimizationDatabase
  readonly defaultServiceTimeSeconds: number
  readonly fallbackWeightKilograms: string
  readonly tripId: string
}): Promise<readonly RouteOptimizationStop[]> {
  const rows = await input.database
    .select({
      addressKey: tripStops.addressKey,
      deliveryWindowEnd: tripStops.deliveryWindowEnd,
      deliveryWindowStart: tripStops.deliveryWindowStart,
      id: tripStops.id,
      label: tripStops.label,
      latitude: geocodedAddresses.latitude,
      longitude: geocodedAddresses.longitude,
      precision: geocodedAddresses.precision,
      sequence: tripStops.sequence,
    })
    .from(tripStops)
    .leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
    .orderBy(tripStops.sequence)

  const dayStart = startOfUtcDaySeconds(new Date())

  return rows.map((row) => {
    const hasFineCoordinate =
      row.latitude !== null && row.longitude !== null && row.precision !== 'city'

    return {
      addressKey: row.addressKey,
      excludedFromOptimization: !hasFineCoordinate,
      label: row.label,
      /** Sem coordenada, uma que o solver nunca usa: a parada já saiu da otimização. */
      latitude: row.latitude ?? '0',
      longitude: row.longitude ?? '0',
      serviceTimeSeconds: input.defaultServiceTimeSeconds,
      stopId: row.id,
      /**
       * O peso ainda não vem da nota (spec 060): entra o médio da empresa, e **marcado** — o
       * conferente precisa saber que aquela linha é estimativa antes de aceitar.
       */
      weightEstimated: true,
      weightKilograms: Number(input.fallbackWeightKilograms),
      windowEndSeconds: toRelativeSeconds(row.deliveryWindowEnd, dayStart),
      windowStartSeconds: toRelativeSeconds(row.deliveryWindowStart, dayStart),
    }
  })
}

async function readVehicles(input: {
  readonly companyId: string
  readonly database: RouteOptimizationDatabase
  readonly tripId: string
}) {
  const rows = await input.database
    .select({
      capacityKilograms: fleetVehicles.capacityKilograms,
      id: fleetVehicles.id,
      otherCostsPerKilometer: fleetVehicles.otherCostsPerKilometer,
    })
    .from(trips)
    .innerJoin(
      fleetVehicles,
      and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
    )
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)

  return rows.map((row) => ({
    capacityKilograms: Number(row.capacityKilograms),
    /**
     * O custo por metro em micros: o solver soma milhares de vezes, e somar decimal em ponto
     * flutuante acumula erro que muda a ordem escolhida. Inteiro não acumula.
     */
    costPerMeterMicros: Math.round(
      (Number(row.otherCostsPerKilometer) / METRES_PER_KILOMETRE) * MICROS_PER_UNIT,
    ),
    id: row.id,
  }))
}

async function readPoint(input: {
  readonly addressKey: string
  readonly database: RouteOptimizationDatabase
}) {
  if (input.addressKey === '') return null

  const [row] = await input.database
    .select({
      latitude: geocodedAddresses.latitude,
      longitude: geocodedAddresses.longitude,
    })
    .from(geocodedAddresses)
    .where(eq(geocodedAddresses.addressKey, input.addressKey))
    .limit(1)

  return row === undefined
    ? null
    : { addressKey: input.addressKey, latitude: row.latitude, longitude: row.longitude }
}

function startOfUtcDaySeconds(now: Date): number {
  return Math.floor(now.getTime() / 1_000 / SECONDS_PER_DAY) * SECONDS_PER_DAY
}

function toRelativeSeconds(value: Date | null, dayStartSeconds: number): number | null {
  return value === null ? null : Math.floor(value.getTime() / 1_000) - dayStartSeconds
}

function readBudget(assumptions: unknown, fallback: number): number {
  if (typeof assumptions !== 'object' || assumptions === null) return fallback
  const budget = (assumptions as { readonly solverTimeBudgetSeconds?: unknown })
    .solverTimeBudgetSeconds

  return typeof budget === 'number' && budget > 0 ? budget : fallback
}

/** Só para o tipo do `complete`, que o handler já descreve. */
export type { RouteOptimizationOutcome }
