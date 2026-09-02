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
import {
  deliveryClientExceptions,
  deliveryClientWindows,
  deliveryClients,
  municipalHolidays,
} from '../../database/delivery-client.schema.js'
import {
  resolvePhysicalDestination,
  PHYSICAL_DESTINATION_ORIGINS,
} from '../domain/physical-destination.policy.js'
import { resolveDeliveryWindow } from '../domain/delivery-window.policy.js'
import { buildStopAddressKey } from '../domain/pool-address-key.js'
import type {
  RouteOptimizationContext,
  RouteOptimizationOutcome,
  RouteOptimizationStop,
} from '../application/route-optimization.effect.js'
import { isOptimizablePrecision } from '../application/resolve-stop-coordinates.use-case.js'
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
  /** Empresa sem linha de configuração opera no fuso da maior parte do país. */
  timezone: 'America/Sao_Paulo',
} as const

export type RouteOptimizationRepository = Pick<
  RouteOptimizationHandlerPorts,
  'claim' | 'complete' | 'fail' | 'release'
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
       * O dia da sugestão, e ele é **um só**: a janela do cliente e o relógio do solver precisam da
       * mesma origem, senão a parada abriria às 8h de um dia e o percurso contaria a partir de outro.
       */
      const dayStartSeconds = startOfUtcDaySeconds(new Date())

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
              date: toUtcDate(dayStartSeconds),
              dayStartSeconds,
              timezone: settings.timezone,
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
        dayStartEpochSeconds: dayStartSeconds,
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

    /**
     * A volta para `queued`, e **só a partir de `running`**: uma sugestão que alguém decidiu entre a
     * falha e a devolução não pode ser ressuscitada por uma mensagem atrasada.
     */
    async release(job) {
      await database
        .update(routeSuggestions)
        .set({ status: 'queued', updatedAt: sql`now()` })
        .where(
          and(
            eq(routeSuggestions.companyId, job.companyId),
            eq(routeSuggestions.id, job.suggestionId),
            eq(routeSuggestions.status, 'running'),
          ),
        )
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
          timezone: row.timezone,
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
      row.latitude !== null && row.longitude !== null && isOptimizablePrecision(row.precision)

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
  readonly date: string
  readonly dayStartSeconds: number
  readonly defaultServiceTimeSeconds: number
  readonly fallbackWeightKilograms: string
  readonly suggestionId: string
  readonly timezone: string
}): Promise<readonly RouteOptimizationStop[]> {
  const rows = await input.database
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      nfeDocumentId: routeSuggestionDocuments.nfeDocumentId,
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
      /** Spec 060: o cliente de entrega é resolvido pelo documento do destinatário. */
      recipientTaxId: nfeParticipants.taxId,
      role: nfeParticipants.role,
    })
    .from(routeSuggestionDocuments)
    .innerJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, routeSuggestionDocuments.companyId),
        eq(nfeParticipants.documentId, routeSuggestionDocuments.nfeDocumentId),
        inArray(nfeParticipants.role, [...PHYSICAL_DESTINATION_ORIGINS]),
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
  /**
   * Spec 073: a nota pode trazer **dois** destinos, e a parada é a de `<entrega>` quando ela vem.
   * O CNPJ, esse, continua sendo o do **destinatário**: ele é a identidade do cliente de entrega
   * (spec 060), e o documento de quem recebe a carga no galpão diria outra coisa.
   */
  const destinations = new Map<
    string,
    { readonly address: (typeof rows)[number]; readonly recipientTaxId: string | null }
  >()
  const byDocument = new Map<string, (typeof rows)[number][]>()
  for (const row of rows) {
    const current = byDocument.get(row.nfeDocumentId)
    if (current === undefined) byDocument.set(row.nfeDocumentId, [row])
    else current.push(row)
  }
  for (const [documentId, candidates] of byDocument) {
    const chosen = resolvePhysicalDestination(
      candidates.map((row) => ({
        components: { cityCode: row.cityCode, number: row.number, postalCode: row.postalCode },
        origin: row.role === 'delivery' ? ('delivery' as const) : ('recipient' as const),
        row,
      })),
    )
    if (chosen === null) continue
    destinations.set(documentId, {
      address: chosen.row,
      recipientTaxId: candidates.find((row) => row.role === 'recipient')?.recipientTaxId ?? null,
    })
  }

  const grouped = new Map<
    string,
    { city: string | null; cityCode: string | null; documentIds: string[]; taxIds: Set<string> }
  >()
  for (const { address: row, recipientTaxId } of destinations.values()) {
    const addressKey = buildStopAddressKey(row)
    /** Nota sem CEP não vira parada proposta; ela entra na viagem sem parada, como já entra hoje. */
    if (addressKey === null) continue

    const existing = grouped.get(addressKey)
    if (existing === undefined) {
      grouped.set(addressKey, {
        city: row.city,
        cityCode: row.cityCode,
        documentIds: [row.nfeDocumentId],
        taxIds: new Set(recipientTaxId === null ? [] : [recipientTaxId]),
      })
      continue
    }
    existing.documentIds.push(row.nfeDocumentId)
    // ⚠️ O documento vem do destinatário, resolvido acima — nunca da linha escolhida: com
    // `<entrega>` vencendo, ela é a da entrega, e o CNPJ dela é o de quem recebe no galpão.
    if (recipientTaxId !== null) existing.taxIds.add(recipientTaxId)
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
  const windows = await readPoolWindows({
    companyId: input.companyId,
    database: input.database,
    date: input.date,
    stops: [...grouped.values()].map((group) => ({
      cityCode: group.cityCode,
      taxIds: [...group.taxIds],
    })),
  })

  return [...grouped.entries()].map(([addressKey, group]) => {
    const point = byKey.get(addressKey)
    const window = resolvePoolWindow({
      offsetSeconds: utcOffsetSeconds({ date: input.date, timezone: input.timezone }),
      taxIds: [...group.taxIds],
      windows,
    })
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
      windowEndSeconds: window.endSeconds,
      windowStartSeconds: window.startSeconds,
    }
  })
}

type PoolWindowIntervals = ReadonlyMap<string, readonly { closesAt: string; opensAt: string }[]>

/**
 * Spec 058 P2 + 060 D2: **a hora em que o cliente recebe**, resolvida pelo documento do destinatário.
 * Uma consulta por tabela, não uma por parada: um pool de oitenta notas viraria oitenta idas ao banco
 * numa rotina que já é a mais pesada do worker.
 *
 * A precedência é a da 060, e ela vem da política copiada — exceção do cliente vence feriado do
 * município, e cliente sem cadastro de janela é **ausência de restrição**, não fechado.
 */
async function readPoolWindows(input: {
  readonly companyId: string
  readonly database: RouteOptimizationDatabase
  readonly date: string
  readonly stops: readonly {
    readonly cityCode: string | null
    readonly taxIds: readonly string[]
  }[]
}): Promise<PoolWindowIntervals> {
  const taxIds = [...new Set(input.stops.flatMap((stop) => stop.taxIds))]
  if (taxIds.length === 0) return new Map()

  const clients = await input.database
    .select({ id: deliveryClients.id, taxId: deliveryClients.taxId })
    .from(deliveryClients)
    .where(
      and(eq(deliveryClients.companyId, input.companyId), inArray(deliveryClients.taxId, taxIds)),
    )
  if (clients.length === 0) return new Map()

  const clientIds = clients.map((client) => client.id)
  const cityCodes = [
    ...new Set(
      input.stops
        .map((stop) => stop.cityCode)
        .filter((cityCode): cityCode is string => cityCode !== null && cityCode !== ''),
    ),
  ]

  const [windows, exceptions, holidays] = await Promise.all([
    input.database
      .select({
        closesAt: deliveryClientWindows.closesAt,
        deliveryClientId: deliveryClientWindows.deliveryClientId,
        opensAt: deliveryClientWindows.opensAt,
        weekday: deliveryClientWindows.weekday,
      })
      .from(deliveryClientWindows)
      .where(
        and(
          eq(deliveryClientWindows.companyId, input.companyId),
          inArray(deliveryClientWindows.deliveryClientId, clientIds),
        ),
      ),
    input.database
      .select({
        closesAt: deliveryClientExceptions.closesAt,
        deliveryClientId: deliveryClientExceptions.deliveryClientId,
        exceptionOn: deliveryClientExceptions.exceptionOn,
        kind: deliveryClientExceptions.kind,
        opensAt: deliveryClientExceptions.opensAt,
      })
      .from(deliveryClientExceptions)
      .where(
        and(
          eq(deliveryClientExceptions.companyId, input.companyId),
          inArray(deliveryClientExceptions.deliveryClientId, clientIds),
          eq(deliveryClientExceptions.exceptionOn, input.date),
        ),
      ),
    cityCodes.length === 0
      ? Promise.resolve([])
      : input.database
          .select({ holidayOn: municipalHolidays.holidayOn })
          .from(municipalHolidays)
          .where(
            and(
              eq(municipalHolidays.companyId, input.companyId),
              inArray(municipalHolidays.cityIbgeCode, cityCodes),
              eq(municipalHolidays.holidayOn, input.date),
            ),
          ),
  ])

  const resolved = new Map<string, readonly { closesAt: string; opensAt: string }[]>()
  for (const client of clients) {
    const window = resolveDeliveryWindow({
      date: input.date,
      exceptions: exceptions
        .filter((exception) => exception.deliveryClientId === client.id)
        .map((exception) => ({
          closesAt: exception.closesAt,
          exceptionOn: exception.exceptionOn,
          kind: exception.kind === 'closed' ? ('closed' as const) : ('open' as const),
          opensAt: exception.opensAt,
        })),
      holidays: holidays.map((holiday) => ({ holidayOn: holiday.holidayOn })),
      windows: windows
        .filter((row) => row.deliveryClientId === client.id)
        .map((row) => ({ closesAt: row.closesAt, opensAt: row.opensAt, weekday: row.weekday })),
    })

    /**
     * `unset` é ausência de regra e vira ausência de janela — o solver não penaliza hora nenhuma.
     * `closed` (intervalos vazios com origem declarada) é o oposto, e por isso ele **não** cai aqui:
     * ver `resolvePoolWindow`.
     */
    if (window.source === 'unset') continue
    resolved.set(client.taxId, window.intervals)
  }

  return resolved
}

/**
 * ⚠️ **O solver representa uma janela por parada**, e o cliente pode ter duas (manhã e tarde). Fica a
 * **primeira** — a mais cedo —, e não o intervalo que vai da abertura ao fechamento do dia: unir os
 * dois faria o roteiro propor chegada no horário de almoço, que a portaria recusa. Perder a tarde é
 * proposta pobre; propor a hora fechada é caminhão parado no portão.
 *
 * Cliente **fechado** no dia (janela cadastrada, nenhum intervalo hoje) recebe uma janela impossível
 * — abre e fecha no mesmo instante —, que o solver trata como violação explícita em vez de esconder:
 * é a mesma regra da precisão grosseira, o operador precisa ver antes de aceitar.
 */
function resolvePoolWindow(input: {
  readonly offsetSeconds: number
  readonly taxIds: readonly string[]
  readonly windows: PoolWindowIntervals
}): { readonly endSeconds: number | null; readonly startSeconds: number | null } {
  for (const taxId of input.taxIds) {
    const intervals = input.windows.get(taxId)
    if (intervals === undefined) continue

    const first = intervals[0]
    if (first === undefined) return { endSeconds: 0, startSeconds: 0 }

    return {
      endSeconds: toDaySeconds(first.closesAt) + input.offsetSeconds,
      startSeconds: toDaySeconds(first.opensAt) + input.offsetSeconds,
    }
  }

  return { endSeconds: null, startSeconds: null }
}

/** `HH:MM` ou `HH:MM:SS` — o Postgres devolve com segundos, o cadastro às vezes manda sem. */
function toDaySeconds(time: string): number {
  const [hours = '0', minutes = '0', seconds = '0'] = time.split(':')

  return Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)
}

/**
 * Quanto somar à hora local para chegar ao relógio do solver, que conta a partir da meia-noite UTC.
 * A janela do cliente é hora **local** — a portaria abre às 8h daqui, não às 8h UTC —, e sem esta
 * conta o roteiro proporia chegada três horas antes da abertura.
 *
 * O fuso vem da empresa (`company_route_optimization_settings.timezone`) e é resolvido **na data da
 * sugestão**, com `Intl`: assim horário de verão não é premissa, e o Acre (UTC-5) funciona sem código
 * novo. Fuso desconhecido cai em UTC e a conta continua fechando — a hora fica errada, mas ninguém
 * fica sem roteiro por causa de um nome digitado errado no cadastro.
 */
export function utcOffsetSeconds(input: {
  readonly date: string
  readonly timezone: string
}): number {
  try {
    const reference = new Date(`${input.date}T12:00:00Z`)
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: input.timezone,
    })
    const localHour = Number(formatter.format(reference))

    /** Meio-dia UTC visto no fuso local: a diferença de horas é o deslocamento, com sinal invertido. */
    return (12 - localHour) * 3_600
  } catch {
    return 0
  }
}

/** O dia do relógio do solver, em `YYYY-MM-DD`: é a data que a janela do cliente é resolvida. */
function toUtcDate(dayStartSeconds: number): string {
  return new Date(dayStartSeconds * 1_000).toISOString().slice(0, 10)
}
