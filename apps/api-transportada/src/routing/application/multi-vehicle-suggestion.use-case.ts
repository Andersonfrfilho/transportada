/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  MultiVehicleSuggestionDocumentUnavailableError,
  MultiVehicleSuggestionDriverRepeatedError,
  MultiVehicleSuggestionDriverUnavailableError,
  MultiVehicleSuggestionEmptyError,
  MultiVehicleSuggestionVehicleUnavailableError,
  RouteSuggestionNotDecidableError,
  RouteSuggestionNotFoundError,
} from '../domain/routing.error.js'
import type {
  AcceptedMultiVehicleTrip,
  SkippedMultiVehicleDocument,
  MultiVehicleScope,
  MultiVehicleSuggestionUseCase,
} from './multi-vehicle-suggestion.port.js'
import type { MultiVehicleSuggestionRepository } from './multi-vehicle-suggestion.repository.js'
import type { RouteOptimizationQueue } from './route-suggestion.use-case.js'
import type { RouteSuggestionAssumptions } from './route-suggestion.port.js'
import type { RouteSuggestionRepository } from './route-suggestion.repository.js'

/**
 * O que o aceite usa para transformar a proposta em viagem. São os casos de uso da 056 vistos de
 * fora — criar, vincular, ordenar e planejar —, e é de propósito que esta lista seja o contrato:
 * ela deixa explícito que a sugestão **não escreve viagem por conta própria** (ADR-0044 §5).
 */
export type TripComposer = Readonly<{
  createTrip: (input: {
    readonly context: MultiVehicleScope
    readonly driverId: string | null
    readonly vehicleId: string
  }) => Promise<{ readonly tripId: string }>
  /**
   * Spec 107 D1: devolve `false` quando a nota **já está viva em outra viagem**, em vez de lançar.
   * Um vínculo recusado não pode derrubar um aceite que já criou cinco viagens corretas — foi o que
   * aconteceu em 2026-09-09, e o operador leu um código de suporte no lugar do roteiro pronto.
   */
  linkDocument: (input: {
    readonly context: MultiVehicleScope
    readonly nfeDocumentId: string
    readonly tripId: string
  }) => Promise<boolean>
  planRoute: (input: {
    readonly context: MultiVehicleScope
    readonly tripId: string
  }) => Promise<void>
  /** As paradas nascem da reconciliação; aqui só se diz em que ordem elas ficam. */
  reorderStops: (input: {
    readonly context: MultiVehicleScope
    readonly orderedAddressKeys: readonly string[]
    readonly tripId: string
  }) => Promise<void>
}>

export type MultiVehicleSuggestionDependencies = Readonly<{
  createSeed?: () => number
  multiVehicle: MultiVehicleSuggestionRepository
  queue: RouteOptimizationQueue
  suggestions: RouteSuggestionRepository
  trips: TripComposer
}>

const MAX_SEED = 2_147_483_647

export function createMultiVehicleSuggestionUseCase(
  dependencies: MultiVehicleSuggestionDependencies,
): MultiVehicleSuggestionUseCase {
  const createSeed = dependencies.createSeed ?? (() => Math.floor(Math.random() * MAX_SEED))

  async function readReady(input: { readonly companyId: string; readonly suggestionId: string }) {
    const found = await dependencies.suggestions.find(input)
    /**
     * `tripId !== null` é sugestão **de viagem**, e ela não se decide por aqui: as duas rotas moram
     * em árvores diferentes de propósito, e responder pela outra faria o aceite de uma viagem
     * existente criar viagem nova.
     */
    if (found === null || found.tripId !== null) throw new RouteSuggestionNotFoundError()
    if (found.status !== 'ready') throw new RouteSuggestionNotDecidableError()

    return found
  }

  return {
    async accept({ context, suggestionId }) {
      const found = await readReady({ companyId: context.companyId, suggestionId })
      const groups = await dependencies.multiVehicle.readGroups({
        companyId: context.companyId,
        suggestionId,
      })

      /**
       * Spec 107 D2: **a sugestão é reivindicada antes de qualquer viagem nascer.**
       *
       * ⚠️ A ordem era a inversa, de propósito — criar primeiro deixava a sugestão `ready` quando a
       * criação falhava no meio, e o operador repetia. Mas `accept` gastava **onze segundos**
       * criando viagens entre ler `ready` e marcar `accepted`, e dois pedidos nessa janela passavam
       * os dois: medido em 2026-09-09, o segundo criou uma viagem órfã e morreu ao vincular uma nota
       * que o primeiro acabara de vincular.
       *
       * `decide` já era condicional (`where status = 'ready'`); faltava chamá-lo cedo. A retomada
       * que a ordem antiga protegia é preservada pela **escrita compensatória** do `catch`.
       */
      const decided = await dependencies.suggestions.decide({
        companyId: context.companyId,
        decidedByUserId: context.userId,
        status: 'accepted',
        suggestionId,
      })
      if (decided === null) throw new RouteSuggestionNotDecidableError()

      const trips: AcceptedMultiVehicleTrip[] = []
      const skippedDocuments: SkippedMultiVehicleDocument[] = []
      try {
        for (const group of groups) {
          const { tripId } = await dependencies.trips.createTrip({
            context,
            driverId: group.driverId,
            vehicleId: group.vehicleId,
          })

          let linkedCount = 0
          for (const nfeDocumentId of group.documentIds) {
            const linked = await dependencies.trips.linkDocument({ context, nfeDocumentId, tripId })
            if (linked) linkedCount += 1
            else skippedDocuments.push({ nfeDocumentId, reason: 'already_linked' })
          }

          if (group.orderedAddressKeys.length > 0) {
            await dependencies.trips.reorderStops({
              context,
              orderedAddressKeys: group.orderedAddressKeys,
              tripId,
            })
          }

          /** A viagem sai daqui em `route_planned`: é o que a spec promete ao operador (RF-5). */
          await dependencies.trips.planRoute({ context, tripId })

          trips.push({
            documentCount: linkedCount,
            driverId: group.driverId,
            stopCount: group.orderedAddressKeys.length,
            tripId,
            vehicleId: group.vehicleId,
          })
        }
      } catch (cause) {
        /**
         * ⚠️ A escrita compensatória: devolve a sugestão para `ready`, e o operador repete — é a
         * propriedade que a ordem antiga protegia. Ela **não** desfaz as viagens já criadas:
         * apagá-las seria destruir trabalho que pode estar correto, e a lista de viagens mostra o
         * que nasceu.
         */
        await dependencies.suggestions.release({ companyId: context.companyId, suggestionId })
        throw cause
      }

      return { skippedDocuments, suggestion: { ...decided, stops: found.stops }, trips }
    },

    async create(input) {
      const documentIds = [...new Set(input.documentIds)]
      /** O par é único **pelo veículo**: pedir duas vezes o mesmo caminhão é o mesmo caminhão. */
      const vehicles = [...new Map(input.vehicles.map((pair) => [pair.vehicleId, pair])).values()]
      const vehicleIds = vehicles.map((pair) => pair.vehicleId)
      if (documentIds.length === 0) throw new MultiVehicleSuggestionEmptyError('documentIds')
      if (vehicleIds.length === 0) throw new MultiVehicleSuggestionEmptyError('vehicleIds')

      /**
       * RF-2: o mesmo motorista em dois pares seriam duas viagens simultâneas dele no PWA, sem nada
       * dizendo qual é a de hoje. Aqui a repetição é do **chamador**, e por isso é recusa, não
       * deduplicação como a do veículo — descartar em silêncio deixaria um caminhão sem motorista
       * sem ninguém saber por quê.
       */
      const driverIds = vehicles
        .map((pair) => pair.driverId)
        .filter((driverId): driverId is string => driverId !== undefined)
      const repeated = driverIds.filter((driverId, index) => driverIds.indexOf(driverId) !== index)
      if (repeated.length > 0) {
        throw new MultiVehicleSuggestionDriverRepeatedError([...new Set(repeated)])
      }

      /**
       * As conferências correm juntas: elas não dependem uma da outra, e a lentidão de uma seguida
       * da outra apareceria numa tela em que o operador acabou de selecionar oitenta notas.
       */
      const [unavailableDocuments, unavailableVehicles, unavailableDrivers] = await Promise.all([
        dependencies.multiVehicle.findUnavailableDocumentIds({
          companyId: input.context.companyId,
          documentIds,
        }),
        dependencies.multiVehicle.findUnavailableVehicleIds({
          companyId: input.context.companyId,
          vehicleIds,
        }),
        dependencies.multiVehicle.findUnavailableDriverIds({
          companyId: input.context.companyId,
          driverIds,
        }),
      ])
      if (unavailableDocuments.length > 0) {
        throw new MultiVehicleSuggestionDocumentUnavailableError(unavailableDocuments)
      }
      if (unavailableVehicles.length > 0) {
        throw new MultiVehicleSuggestionVehicleUnavailableError(unavailableVehicles)
      }
      if (unavailableDrivers.length > 0) {
        throw new MultiVehicleSuggestionDriverUnavailableError(unavailableDrivers)
      }

      const settings = await dependencies.suggestions.readSettings(input.context.companyId)
      const assumptions: RouteSuggestionAssumptions = {
        dutyEnabled: Object.values(settings.duty).some((limit) => limit !== null),
        endPolicy: settings.endPolicy,
        fallbackWeightKilograms: settings.fallbackWeightKilograms,
        originAddressKey: settings.originAddressKey,
        serviceTimeSeconds: settings.defaultServiceTimeSeconds,
        serviceTimeSource: 'default',
        solverTimeBudgetSeconds: input.solverTimeBudgetSeconds ?? settings.solverTimeBudgetSeconds,
      }

      const created = await dependencies.multiVehicle.create({
        assumptions,
        companyId: input.context.companyId,
        documentIds,
        seed: input.seed ?? createSeed(),
        vehicles,
      })

      await dependencies.queue.publish({
        companyId: input.context.companyId,
        correlationId: input.correlationId,
        suggestionId: created.id,
      })

      return created
    },

    async read({ context, suggestionId }) {
      const found = await dependencies.suggestions.find({
        companyId: context.companyId,
        suggestionId,
      })
      if (found === null || found.tripId !== null) throw new RouteSuggestionNotFoundError()

      return found
    },

    async reject({ context, suggestionId }) {
      await readReady({ companyId: context.companyId, suggestionId })

      const decided = await dependencies.suggestions.decide({
        companyId: context.companyId,
        decidedByUserId: context.userId,
        status: 'rejected',
        suggestionId,
      })
      if (decided === null) throw new RouteSuggestionNotDecidableError()

      return decided
    },
  }
}
