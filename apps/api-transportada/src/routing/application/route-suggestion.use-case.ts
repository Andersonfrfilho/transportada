/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  RouteSuggestionNotDecidableError,
  RouteSuggestionNotFoundError,
  RouteSuggestionTripDispatchedError,
} from '../domain/routing.error.js'
import type {
  RouteSuggestion,
  RouteSuggestionAssumptions,
  RouteSuggestionUseCase,
} from './route-suggestion.port.js'
import type {
  RouteSuggestionRecord,
  RouteSuggestionRepository,
} from './route-suggestion.repository.js'

/** A viagem só aceita roteiro novo enquanto não saiu (ADR-0043 §2: `dispatched` é não-retorno). */
export type TripRouteGate = Readonly<{
  readAcceptsRouting: (input: {
    readonly companyId: string
    readonly tripId: string
  }) => Promise<{ readonly accepts: boolean; readonly exists: boolean }>
}>

/**
 * A publicação na fila. O caso de uso não conhece RabbitMQ — ele conhece "peça para otimizarem", e
 * é isso que permite o teste rodar sem broker.
 */
export type RouteOptimizationQueue = Readonly<{
  publish: (input: {
    readonly companyId: string
    readonly correlationId: string
    readonly suggestionId: string
  }) => Promise<void>
}>

/**
 * ADR-0044 §5: o aceite escreve pela **mesma rota da 056**. A sugestão nunca escreve `trip_stops`
 * por conta própria — se ela tivesse o próprio caminho de escrita, existiriam duas regras para
 * reordenar parada, e a segunda esqueceria a porta de não-retorno que a primeira respeita.
 */
export type StopOrderWriter = Readonly<{
  reorder: (input: {
    readonly companyId: string
    readonly orderedStopIds: readonly string[]
    readonly tripId: string
  }) => Promise<void>
}>

export type RouteSuggestionDependencies = Readonly<{
  queue: RouteOptimizationQueue
  repository: RouteSuggestionRepository
  stopOrder: StopOrderWriter
  trips: TripRouteGate
  /** Injetado para o determinismo ser testável: semente sorteada não se verifica. */
  createSeed?: () => number
}>

const MAX_SEED = 2_147_483_647

export function createRouteSuggestionUseCase(
  dependencies: RouteSuggestionDependencies,
): RouteSuggestionUseCase {
  const createSeed = dependencies.createSeed ?? defaultSeed

  return {
    async create(input) {
      const gate = await dependencies.trips.readAcceptsRouting({
        companyId: input.context.companyId,
        tripId: input.tripId,
      })
      if (!gate.exists) throw new RouteSuggestionNotFoundError()
      if (!gate.accepts) throw new RouteSuggestionTripDispatchedError()

      const settings = await dependencies.repository.readSettings(input.context.companyId)
      const assumptions: RouteSuggestionAssumptions = {
        dutyEnabled: isDutyEnabled(settings.duty),
        endPolicy: settings.endPolicy,
        fallbackWeightKilograms: settings.fallbackWeightKilograms,
        originAddressKey: settings.originAddressKey,
        /**
         * O tempo de serviço aqui é o padrão da empresa: a mediana medida depende das paradas, que
         * só o worker carrega. Ele reescreve `assumptions` ao terminar, com a origem real (D6).
         */
        serviceTimeSeconds: settings.defaultServiceTimeSeconds,
        serviceTimeSource: 'default',
        solverTimeBudgetSeconds: input.solverTimeBudgetSeconds ?? settings.solverTimeBudgetSeconds,
      }

      const created = await dependencies.repository.create({
        assumptions,
        companyId: input.context.companyId,
        seed: input.seed ?? createSeed(),
        tripId: input.tripId,
        vehicleId: input.vehicleIds?.[0] ?? null,
      })

      /**
       * A publicação vem **depois** da linha existir. Publicar antes abriria a janela em que o worker
       * busca uma sugestão que ainda não foi gravada — e ele a trataria como inexistente.
       */
      await dependencies.queue.publish({
        companyId: input.context.companyId,
        correlationId: input.correlationId,
        suggestionId: created.id,
      })

      return toSuggestion(created)
    },

    async read(input) {
      const found = await dependencies.repository.find({
        companyId: input.context.companyId,
        suggestionId: input.suggestionId,
      })
      if (found === null || found.tripId !== input.tripId) throw new RouteSuggestionNotFoundError()

      return toSuggestion(found)
    },

    async accept(input) {
      const found = await readReady(dependencies, input)

      /**
       * A viagem é conferida **de novo** no aceite, não só na criação: entre pedir a sugestão e
       * aceitá-la a viagem pode ter saído, e aplicar roteiro a viagem despachada é reescrever o que
       * já rodou.
       */
      const gate = await dependencies.trips.readAcceptsRouting({
        companyId: input.context.companyId,
        tripId: input.tripId,
      })
      if (!gate.exists) throw new RouteSuggestionNotFoundError()
      if (!gate.accepts) throw new RouteSuggestionTripDispatchedError()

      const orderedStopIds = found.stops
        .map((stop) => stop.stopId)
        .filter((stopId): stopId is string => stopId !== null)

      /**
       * A ordem é escrita **antes** de a sugestão virar `accepted`. Se a escrita falhar, a sugestão
       * continua `ready` e o conferente tenta de novo — o contrário deixaria uma sugestão marcada
       * como aceita sem que roteiro nenhum tivesse mudado.
       */
      if (orderedStopIds.length > 0) {
        await dependencies.stopOrder.reorder({
          companyId: input.context.companyId,
          orderedStopIds,
          tripId: input.tripId,
        })
      }

      const decided = await dependencies.repository.decide({
        companyId: input.context.companyId,
        decidedByUserId: input.context.userId,
        status: 'accepted',
        suggestionId: input.suggestionId,
      })
      if (decided === null) throw new RouteSuggestionNotDecidableError()

      return toSuggestion({ ...decided, stops: found.stops })
    },

    async reject(input) {
      await readReady(dependencies, input)

      const decided = await dependencies.repository.decide({
        companyId: input.context.companyId,
        decidedByUserId: input.context.userId,
        status: 'rejected',
        suggestionId: input.suggestionId,
      })
      if (decided === null) throw new RouteSuggestionNotDecidableError()

      return toSuggestion(decided)
    },
  }
}

async function readReady(
  dependencies: RouteSuggestionDependencies,
  input: {
    readonly context: { readonly companyId: string }
    readonly suggestionId: string
    readonly tripId: string
  },
): Promise<RouteSuggestionRecord> {
  const found = await dependencies.repository.find({
    companyId: input.context.companyId,
    suggestionId: input.suggestionId,
  })
  if (found === null || found.tripId !== input.tripId) throw new RouteSuggestionNotFoundError()
  if (found.status !== 'ready') throw new RouteSuggestionNotDecidableError()

  return found
}

/** Jornada ligada é qualquer limite declarado; nenhum declarado é "não é restrição aqui" (D6b). */
function isDutyEnabled(duty: {
  readonly breakEverySeconds: number | null
  readonly mandatoryBreakSeconds: number | null
  readonly maxDrivingSeconds: number | null
  readonly maxDutySeconds: number | null
}): boolean {
  return Object.values(duty).some((limit) => limit !== null)
}

function defaultSeed(): number {
  return Math.floor(Math.random() * MAX_SEED)
}

function toSuggestion(record: RouteSuggestionRecord): RouteSuggestion {
  return record
}
