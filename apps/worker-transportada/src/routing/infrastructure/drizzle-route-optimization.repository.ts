/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  companyRouteOptimizationSettings,
  fleetVehicles,
  geocodedAddresses,
  routeSuggestionDocuments,
  routeSuggestionStopDocuments,
  routeSuggestionStops,
  routeSuggestionVehicles,
  routeSuggestions,
  tripStops,
  trips,
} from '../../database/routing.schema.js'
import { nfeAddresses, nfeParticipants } from '../../database/nfe.schema.js'
import { buildStopAddressKey } from '../domain/pool-address-key.js'
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

      if (suggestion === undefined) return null

      const settings = await readSettings({ companyId: job.companyId, database })

      /**
       * Spec 058 P2: **as duas origens do problema.** Sugestão de viagem lê as paradas que já
       * existem; a multi-veículo lê o pool de notas e agrupa por endereço do destinatário — o mesmo
       * agrupamento que a reconciliação da 056 faz quando a nota entra na viagem. Se aqui ele fosse
       * outro, a parada proposta e a parada criada no aceite discordariam.
       */
      const stops =
        suggestion.tripId === null
          ? await readPoolStops({
              companyId: job.companyId,
              database,
              defaultServiceTimeSeconds: settings.defaultServiceTimeSeconds,
              fallbackWeightKilograms: settings.fallbackWeightKilograms,
              suggestionId: job.suggestionId,
            })
          : await readStops({
              companyId: job.companyId,
              database,
              defaultServiceTimeSeconds: settings.defaultServiceTimeSeconds,
              fallbackWeightKilograms: settings.fallbackWeightKilograms,
              tripId: suggestion.tripId,
            })
      const vehicles =
        suggestion.tripId === null
          ? await readPoolVehicles({
              companyId: job.companyId,
              database,
              suggestionId: job.suggestionId,
            })
          : await readVehicles({
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
          const inserted = await transaction
            .insert(routeSuggestionStops)
            .values(
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
                vehicleId: stop.vehicleId,
                violations: stop.violations,
                weightEstimated: stop.weightEstimated,
              })),
            )
            .returning({ id: routeSuggestionStops.id, sequence: routeSuggestionStops.sequence })

          /**
           * Spec 058 P2: qual nota caiu em qual parada proposta. Sem isso o aceite teria de reagrupar
           * as notas por endereço **de novo**, e o segundo agrupamento poderia discordar do primeiro.
           * O casamento é por `sequence`, que é única por sugestão.
           */
          const stopIdBySequence = new Map(inserted.map((row) => [Number(row.sequence), row.id]))
          const links = outcome.orderedStops.flatMap((stop) => {
            const suggestionStopId = stopIdBySequence.get(stop.sequence)
            if (suggestionStopId === undefined) return []

            return stop.documentIds.map((nfeDocumentId) => ({
              companyId: job.companyId,
              nfeDocumentId,
              suggestionStopId,
            }))
          })
          if (links.length > 0) {
            await transaction.insert(routeSuggestionStopDocuments).values(links)
          }
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
      /** Sugestão de viagem: a nota já está vinculada, e a parada existe. Nada a propor aqui. */
      documentIds: [],
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

/**
 * Spec 058 P2: a frota que o operador ofereceu, **na ordem em que ele a ofereceu**. A ordem é o que
 * torna a distribuição reproduzível com a mesma semente; sem `order by`, Postgres não a promete.
 */
async function readPoolVehicles(input: {
  readonly companyId: string
  readonly database: RouteOptimizationDatabase
  readonly suggestionId: string
}) {
  const rows = await input.database
    .select({
      capacityKilograms: fleetVehicles.capacityKilograms,
      id: fleetVehicles.id,
      otherCostsPerKilometer: fleetVehicles.otherCostsPerKilometer,
    })
    .from(routeSuggestionVehicles)
    .innerJoin(
      fleetVehicles,
      and(
        eq(fleetVehicles.companyId, routeSuggestionVehicles.companyId),
        eq(fleetVehicles.id, routeSuggestionVehicles.vehicleId),
      ),
    )
    .where(
      and(
        eq(routeSuggestionVehicles.companyId, input.companyId),
        eq(routeSuggestionVehicles.suggestionId, input.suggestionId),
      ),
    )
    .orderBy(routeSuggestionVehicles.position)

  return rows.map((row) => ({
    capacityKilograms: Number(row.capacityKilograms),
    costPerMeterMicros: Math.round(
      (Number(row.otherCostsPerKilometer) / METRES_PER_KILOMETRE) * MICROS_PER_UNIT,
    ),
    id: row.id,
  }))
}

/**
 * Spec 058 P2: **a parada nasce do endereço do destinatário**, agrupando as notas do pool — o mesmo
 * critério da reconciliação da 056 (ADR-0043 §3). Nota sem endereço de destinatário fica de fora do
 * problema, e não do aceite: ela entra na viagem como nota sem parada, como já entra hoje.
 */
async function readPoolStops(input: {
  readonly companyId: string
  readonly database: RouteOptimizationDatabase
  readonly defaultServiceTimeSeconds: number
  readonly fallbackWeightKilograms: string
  readonly suggestionId: string
}): Promise<readonly RouteOptimizationStop[]> {
  const rows = await input.database
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      nfeDocumentId: routeSuggestionDocuments.nfeDocumentId,
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
    })
    .from(routeSuggestionDocuments)
    .innerJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, routeSuggestionDocuments.companyId),
        eq(nfeParticipants.documentId, routeSuggestionDocuments.nfeDocumentId),
        eq(nfeParticipants.role, 'recipient'),
      ),
    )
    .innerJoin(
      nfeAddresses,
      and(
        eq(nfeAddresses.companyId, nfeParticipants.companyId),
        eq(nfeAddresses.participantId, nfeParticipants.id),
      ),
    )
    .where(
      and(
        eq(routeSuggestionDocuments.companyId, input.companyId),
        eq(routeSuggestionDocuments.suggestionId, input.suggestionId),
      ),
    )

  /**
   * O agrupamento é feito **aqui**, não em SQL: a chave tem normalização de verdade (CEP de oito
   * dígitos, prefixo "nº", "S/N"), e montá-la com `concat_ws` produziria uma segunda regra do que é
   * a mesma parada — que discordaria da primeira no dia em que alguém digitasse "Nº 45".
   */
  const grouped = new Map<string, { city: string | null; documentIds: string[] }>()
  for (const row of rows) {
    const addressKey = buildStopAddressKey(row)
    /** Nota sem CEP não vira parada proposta; ela entra na viagem sem parada, como já entra hoje. */
    if (addressKey === null) continue

    const existing = grouped.get(addressKey)
    if (existing === undefined) {
      grouped.set(addressKey, { city: row.city, documentIds: [row.nfeDocumentId] })
      continue
    }
    existing.documentIds.push(row.nfeDocumentId)
  }
  if (grouped.size === 0) return []

  const coordinates = await input.database
    .select({
      addressKey: geocodedAddresses.addressKey,
      latitude: geocodedAddresses.latitude,
      longitude: geocodedAddresses.longitude,
      precision: geocodedAddresses.precision,
    })
    .from(geocodedAddresses)
    .where(inArray(geocodedAddresses.addressKey, [...grouped.keys()]))

  const byKey = new Map(coordinates.map((row) => [row.addressKey, row]))

  return [...grouped.entries()].map(([addressKey, group]) => {
    const point = byKey.get(addressKey)
    const hasFineCoordinate =
      point?.latitude != null && point.longitude !== null && point.precision !== 'city'

    return {
      addressKey,
      documentIds: group.documentIds,
      excludedFromOptimization: !hasFineCoordinate,
      label: group.city ?? addressKey,
      /** Sem coordenada, uma que o solver nunca usa: a parada já saiu da otimização. */
      latitude: point?.latitude ?? '0',
      longitude: point?.longitude ?? '0',
      serviceTimeSeconds: input.defaultServiceTimeSeconds,
      /** A parada não existe ainda: é o aceite que a cria, pela reconciliação da 056. */
      stopId: null,
      /**
       * O peso é sempre o de fallback aqui: a nota do pool ainda não passou pelo cálculo de frete, e
       * inventar peso por produto seria uma segunda regra de peso. Ele vem **marcado**, e a tela
       * mostra isso antes do aceite (ADR-0044 §5).
       */
      weightEstimated: true,
      weightKilograms: Number(input.fallbackWeightKilograms),
      windowEndSeconds: null,
      windowStartSeconds: null,
    }
  })
}
